import { mock } from 'jest-mock-extended';
import type { IExecuteFunctions, IWorkflowDataProxyData, INode } from 'n8n-workflow';

import { ExecuteWorkflow } from './ExecuteWorkflow.node';
import { getWorkflowInfo } from './GenericFunctions';

jest.mock('./GenericFunctions');
jest.mock('../../../utils/utilities');

describe('ExecuteWorkflow', () => {
	const executeWorkflow = new ExecuteWorkflow();
	const executeFunctions = mock<IExecuteFunctions>({
		getNodeParameter: jest.fn(),
		getInputData: jest.fn(),
		getWorkflowDataProxy: jest.fn(),
		executeWorkflow: jest.fn(),
		continueOnFail: jest.fn(),
		setMetadata: jest.fn(),
		getNode: jest.fn(),
	});

	beforeEach(() => {
		jest.clearAllMocks();
		executeFunctions.getInputData.mockReturnValue([{ json: { key: 'value' } }]);
		executeFunctions.getWorkflowDataProxy.mockReturnValue({
			$workflow: { id: 'workflowId' },
			$execution: { id: 'executionId' },
		} as unknown as IWorkflowDataProxyData);
	});

	test('should execute workflow in "each" mode and wait for sub-workflow completion', async () => {
		executeFunctions.getNodeParameter
			.mockReturnValueOnce('database') // source
			.mockReturnValueOnce('each') // mode
			.mockReturnValueOnce({}) // workflowInputs.value
			.mockReturnValueOnce([]) // workflowInputs.schema
			.mockReturnValueOnce(true) // waitForSubWorkflow (at top of each block)
			.mockReturnValueOnce(false) // runInParallel
			.mockReturnValueOnce(true); // waitForSubWorkflow (in loop for item 0)

		executeFunctions.getInputData.mockReturnValue([{ json: { key: 'value' } }]);
		executeFunctions.getWorkflowDataProxy.mockReturnValue({
			$workflow: { id: 'workflowId' },
			$execution: { id: 'executionId' },
		} as unknown as IWorkflowDataProxyData);
		(getWorkflowInfo as jest.Mock).mockResolvedValue({ id: 'subWorkflowId' });
		(executeFunctions.executeWorkflow as jest.Mock).mockResolvedValue({
			executionId: 'subExecutionId',
			data: [[{ json: { key: 'subValue' } }]],
		});

		const result = await executeWorkflow.execute.call(executeFunctions);

		expect(result).toEqual([
			[
				{
					json: { key: 'subValue' },
					pairedItem: { item: 0 },
					metadata: {
						subExecution: { workflowId: 'subWorkflowId', executionId: 'subExecutionId' },
					},
				},
			],
		]);

		// Verify shouldResume is set correctly
		expect(executeFunctions.executeWorkflow).toHaveBeenCalledWith(
			{ id: 'subWorkflowId' },
			[{ json: { key: 'value' }, index: 0, pairedItem: { item: 0 }, binary: undefined }],
			undefined,
			{
				parentExecution: {
					executionId: 'executionId',
					workflowId: 'workflowId',
					shouldResume: true,
				},
			},
		);
	});

	test('should execute workflow in "once" mode and not wait for sub-workflow completion', async () => {
		executeFunctions.getNodeParameter
			.mockReturnValueOnce('database') // source
			.mockReturnValueOnce('once') // mode
			.mockReturnValueOnce({}) // workflowInputs.value
			.mockReturnValueOnce([]) // workflowInputs.schema
			.mockReturnValueOnce(false); // waitForSubWorkflow

		executeFunctions.getInputData.mockReturnValue([{ json: { key: 'value' } }]);
		(getWorkflowInfo as jest.Mock).mockResolvedValue({ id: 'subWorkflowId' });

		executeFunctions.executeWorkflow.mockResolvedValue({
			executionId: 'subExecutionId',
			data: [[{ json: { key: 'subValue' } }]],
		});

		const result = await executeWorkflow.execute.call(executeFunctions);

		expect(result).toEqual([
			[{ json: { key: 'value' }, index: 0, pairedItem: { item: 0 }, binary: undefined }],
		]);

		// Verify shouldResume is set to false
		expect(executeFunctions.executeWorkflow).toHaveBeenCalledWith(
			{ id: 'subWorkflowId' },
			[{ json: { key: 'value' }, index: 0, pairedItem: { item: 0 }, binary: undefined }],
			undefined,
			{
				doNotWaitToFinish: true,
				parentExecution: {
					executionId: 'executionId',
					workflowId: 'workflowId',
					shouldResume: false,
				},
			},
		);
	});

	test('should handle errors and continue on fail, no items, < 1.3 version', async () => {
		executeFunctions.getNodeParameter
			.mockReturnValueOnce('database') // source
			.mockReturnValueOnce('each') // mode
			.mockReturnValueOnce({}) // workflowInputs.value
			.mockReturnValueOnce([]) // workflowInputs.schema
			.mockReturnValueOnce(true) // waitForSubWorkflow
			.mockReturnValueOnce(false) // runInParallel
			.mockReturnValueOnce(true); // waitForSubWorkflow (in loop)

		executeFunctions.getNode.mockReturnValue({ typeVersion: 1.2 } as INode);

		(getWorkflowInfo as jest.Mock).mockRejectedValue(new Error('Test error'));
		(executeFunctions.continueOnFail as jest.Mock).mockReturnValue(true);

		const result = await executeWorkflow.execute.call(executeFunctions);

		expect(result).toEqual([[{ json: { error: 'Test error' }, pairedItem: { item: 0 } }]]);
	});

	test('should handle errors and continue on fail, multiple items, < 1.3 version', async () => {
		executeFunctions.getNodeParameter
			.mockReturnValueOnce('database') // source
			.mockReturnValueOnce('each') // mode
			.mockReturnValueOnce({}) // workflowInputs.value (item 0)
			.mockReturnValueOnce({}) // workflowInputs.value (item 1)
			.mockReturnValueOnce({}) // workflowInputs.value (item 2)
			.mockReturnValueOnce([]) // workflowInputs.schema
			.mockReturnValueOnce(true) // waitForSubWorkflow (at top)
			.mockReturnValueOnce(false) // runInParallel
			.mockReturnValueOnce(true) // waitForSubWorkflow (in loop item 0)
			.mockReturnValueOnce(true) // waitForSubWorkflow (in loop item 1)
			.mockReturnValueOnce(true); // waitForSubWorkflow (in loop item 2)

		executeFunctions.getNode.mockReturnValue({ typeVersion: 1.2 } as INode);
		executeFunctions.getInputData.mockReturnValueOnce([
			{ json: { key: '1' } },
			{ json: { key: '2' } },
			{ json: { key: '3' } },
		]);

		(getWorkflowInfo as jest.Mock).mockRejectedValue(new Error('Test error'));
		(executeFunctions.continueOnFail as jest.Mock).mockReturnValue(true);

		const result = await executeWorkflow.execute.call(executeFunctions);

		expect(result).toEqual([
			[{ json: { error: 'Test error' }, pairedItem: { item: 0 }, metadata: undefined }],
			[{ json: { error: 'Test error' }, pairedItem: { item: 1 }, metadata: undefined }],
			[{ json: { error: 'Test error' }, pairedItem: { item: 2 }, metadata: undefined }],
		]);
	});

	test('should handle errors and continue on fail, no items, >= 1.3 version', async () => {
		executeFunctions.getNodeParameter
			.mockReturnValueOnce('database') // source
			.mockReturnValueOnce('each') // mode
			.mockReturnValueOnce({}) // workflowInputs.value
			.mockReturnValueOnce([]) // workflowInputs.schema
			.mockReturnValueOnce(true) // waitForSubWorkflow
			.mockReturnValueOnce(false) // runInParallel
			.mockReturnValueOnce(true); // waitForSubWorkflow (in loop)

		executeFunctions.getNode.mockReturnValue({ typeVersion: 1.3 } as INode);

		(getWorkflowInfo as jest.Mock).mockRejectedValue(new Error('Test error'));
		(executeFunctions.continueOnFail as jest.Mock).mockReturnValue(true);

		const result = await executeWorkflow.execute.call(executeFunctions);

		expect(result).toEqual([[{ json: { error: 'Test error' }, pairedItem: { item: 0 } }]]);
	});

	test('should handle errors and continue on fail, multiple items, >= 1.3 version', async () => {
		executeFunctions.getNodeParameter
			.mockReturnValueOnce('database') // source
			.mockReturnValueOnce('each') // mode
			.mockReturnValueOnce({}) // workflowInputs.value (item 0)
			.mockReturnValueOnce({}) // workflowInputs.value (item 1)
			.mockReturnValueOnce({}) // workflowInputs.value (item 2)
			.mockReturnValueOnce([]) // workflowInputs.schema
			.mockReturnValueOnce(true) // waitForSubWorkflow (at top)
			.mockReturnValueOnce(false) // runInParallel
			.mockReturnValueOnce(true) // waitForSubWorkflow (in loop item 0)
			.mockReturnValueOnce(true) // waitForSubWorkflow (in loop item 1)
			.mockReturnValueOnce(true); // waitForSubWorkflow (in loop item 2)

		executeFunctions.getNode.mockReturnValue({ typeVersion: 1.3 } as INode);
		executeFunctions.getInputData.mockReturnValueOnce([
			{ json: { key: '1' } },
			{ json: { key: '2' } },
			{ json: { key: '3' } },
		]);

		(getWorkflowInfo as jest.Mock).mockRejectedValue(new Error('Test error'));
		(executeFunctions.continueOnFail as jest.Mock).mockReturnValue(true);

		const result = await executeWorkflow.execute.call(executeFunctions);

		expect(result).toEqual([
			[
				{ json: { error: 'Test error' }, pairedItem: { item: 0 }, metadata: undefined },
				{ json: { error: 'Test error' }, pairedItem: { item: 1 }, metadata: undefined },
				{ json: { error: 'Test error' }, pairedItem: { item: 2 }, metadata: undefined },
			],
		]);
	});

	test('should execute workflow in "each" mode in parallel and sync results at the end', async () => {
		executeFunctions.getNodeParameter
			.mockReturnValueOnce('database') // source
			.mockReturnValueOnce('each') // mode
			.mockReturnValueOnce({}) // workflowInputs.value (item 0)
			.mockReturnValueOnce({}) // workflowInputs.value (item 1)
			.mockReturnValueOnce([]) // workflowInputs.schema
			.mockReturnValueOnce(true) // waitForSubWorkflow
			.mockReturnValueOnce(true); // runInParallel

		executeFunctions.getInputData.mockReturnValue([
			{ json: { key: 'value1' } },
			{ json: { key: 'value2' } },
		]);
		(getWorkflowInfo as jest.Mock).mockResolvedValue({ id: 'subWorkflowId' });
		(executeFunctions.executeWorkflow as jest.Mock)
			.mockResolvedValueOnce({
				executionId: 'subExecutionId1',
				data: [[{ json: { key: 'result1' } }]],
			})
			.mockResolvedValueOnce({
				executionId: 'subExecutionId2',
				data: [[{ json: { key: 'result2' } }]],
			});

		const result = await executeWorkflow.execute.call(executeFunctions);

		expect(result).toEqual([
			[
				{
					json: { key: 'result1' },
					pairedItem: { item: 0 },
					metadata: {
						subExecution: { workflowId: 'subWorkflowId', executionId: 'subExecutionId1' },
					},
				},
				{
					json: { key: 'result2' },
					pairedItem: { item: 1 },
					metadata: {
						subExecution: { workflowId: 'subWorkflowId', executionId: 'subExecutionId2' },
					},
				},
			],
		]);
		expect(executeFunctions.executeWorkflow).toHaveBeenCalledTimes(2);
	});

	test('should handle parallel execution with continue on fail when one sub-workflow fails', async () => {
		executeFunctions.getNodeParameter
			.mockReturnValueOnce('database') // source
			.mockReturnValueOnce('each') // mode
			.mockReturnValueOnce({}) // workflowInputs.value (item 0)
			.mockReturnValueOnce({}) // workflowInputs.value (item 1)
			.mockReturnValueOnce([]) // workflowInputs.schema
			.mockReturnValueOnce(true) // waitForSubWorkflow
			.mockReturnValueOnce(true); // runInParallel

		executeFunctions.getNode.mockReturnValue({ typeVersion: 1.3 } as INode);
		executeFunctions.getInputData.mockReturnValue([
			{ json: { key: 'value1' } },
			{ json: { key: 'value2' } },
		]);
		(getWorkflowInfo as jest.Mock).mockResolvedValue({ id: 'subWorkflowId' });
		(executeFunctions.executeWorkflow as jest.Mock)
			.mockResolvedValueOnce({
				executionId: 'subExecutionId1',
				data: [[{ json: { key: 'result1' } }]],
			})
			.mockRejectedValueOnce(new Error('Sub-workflow failed'));
		(executeFunctions.continueOnFail as jest.Mock).mockReturnValue(true);

		const result = await executeWorkflow.execute.call(executeFunctions);

		expect(result).toEqual([
			[
				{
					json: { key: 'result1' },
					pairedItem: { item: 0 },
					metadata: {
						subExecution: { workflowId: 'subWorkflowId', executionId: 'subExecutionId1' },
					},
				},
				{
					json: { error: 'Sub-workflow failed' },
					pairedItem: { item: 1 },
					metadata: undefined,
				},
			],
		]);
	});

	test('should throw error if not continuing on fail', async () => {
		executeFunctions.getNodeParameter
			.mockReturnValueOnce('database') // source
			.mockReturnValueOnce('each') // mode
			.mockReturnValueOnce({}) // workflowInputs.value
			.mockReturnValueOnce([]) // workflowInputs.schema
			.mockReturnValueOnce(true) // waitForSubWorkflow
			.mockReturnValueOnce(false) // runInParallel
			.mockReturnValueOnce(true); // waitForSubWorkflow (in loop)

		(getWorkflowInfo as jest.Mock).mockRejectedValue(new Error('Test error'));
		(executeFunctions.continueOnFail as jest.Mock).mockReturnValue(false);

		await expect(executeWorkflow.execute.call(executeFunctions)).rejects.toThrow(
			'Error executing workflow with item at index 0',
		);
	});
});
