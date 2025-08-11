import express from 'express';
import { 
    taskCreator, 
    getAllMeetingTasks, 
    getAllPendingTaskSuggestions, 
    approveTaskSuggestion, 
    rejectTaskSuggestion,
    getMeetingTaskStats 
} from '../services/gpt4-analyzer.js';
import debug from 'debug';

const dbg = debug('zoom-app:tasks');
const router = express.Router();

/**
 * Create a task based on GPT-4 analysis
 */
router.post('/create', async (req, res) => {
    try {
        const { analysisResult, userConfirmation = true } = req.body;

        if (!analysisResult) {
            return res.status(400).json({
                success: false,
                error: 'Analysis result is required'
            });
        }

        console.log('📝 TASK CREATION REQUEST:', {
            taskType: analysisResult.taskType,
            description: analysisResult.taskDescription,
            userConfirmation
        });

        const result = await taskCreator.createTask(analysisResult, userConfirmation);

        res.json(result);

    } catch (error) {
        console.error('❌ TASK CREATION API ERROR:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Get supported task types
 */
router.get('/types', (req, res) => {
    res.json({
        supportedTypes: taskCreator.supportedTaskTypes,
        descriptions: {
            meeting: 'Schedule meetings and calendar events',
            jira: 'Create Jira tickets and issues',
            task: 'Create generic tasks and to-dos',
            document: 'Create documents and files',
            project: 'Set up new projects'
        }
    });
});

/**
 * Get completed tasks for a meeting
 */
router.get('/completed/:meetingUuid', (req, res) => {
    try {
        const { meetingUuid } = req.params;
        const tasks = getAllMeetingTasks(meetingUuid);
        
        console.log('📋 FETCHING COMPLETED TASKS:', {
            meetingUuid,
            taskCount: tasks.length
        });
        
        res.json(tasks);
    } catch (error) {
        console.error('❌ ERROR FETCHING COMPLETED TASKS:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Get pending task suggestions for a meeting
 */
router.get('/pending/:meetingUuid', (req, res) => {
    try {
        const { meetingUuid } = req.params;
        const pendingTasks = getAllPendingTaskSuggestions(meetingUuid);
        
        console.log('⏳ FETCHING PENDING TASKS:', {
            meetingUuid,
            pendingCount: pendingTasks.length
        });
        
        res.json(pendingTasks);
    } catch (error) {
        console.error('❌ ERROR FETCHING PENDING TASKS:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Approve a task suggestion
 */
router.post('/approve', async (req, res) => {
    try {
        const { suggestionId } = req.body;
        
        if (!suggestionId) {
            return res.status(400).json({
                success: false,
                error: 'Suggestion ID is required'
            });
        }
        
        console.log('✅ APPROVING TASK SUGGESTION:', suggestionId);
        
        const result = await approveTaskSuggestion(suggestionId);
        res.json(result);
        
    } catch (error) {
        console.error('❌ ERROR APPROVING TASK:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Reject a task suggestion
 */
router.post('/reject', async (req, res) => {
    try {
        const { suggestionId } = req.body;
        
        if (!suggestionId) {
            return res.status(400).json({
                success: false,
                error: 'Suggestion ID is required'
            });
        }
        
        console.log('❌ REJECTING TASK SUGGESTION:', suggestionId);
        
        const result = rejectTaskSuggestion(suggestionId);
        res.json(result);
        
    } catch (error) {
        console.error('❌ ERROR REJECTING TASK:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Get task statistics for a meeting
 */
router.get('/stats/:meetingUuid', (req, res) => {
    try {
        const { meetingUuid } = req.params;
        const stats = getMeetingTaskStats(meetingUuid);
        
        console.log('📊 FETCHING TASK STATS:', {
            meetingUuid,
            stats
        });
        
        res.json(stats);
    } catch (error) {
        console.error('❌ ERROR FETCHING TASK STATS:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Health check for task service
 */
router.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        openaiConfigured: !!process.env.OPENAI_API_KEY
    });
});

export default router;
