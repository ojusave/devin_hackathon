import OpenAI from 'openai';
import debug from 'debug';
import fetch from 'node-fetch';

const dbg = debug('zoom-app:gpt4-analyzer');

// Configuration for zoom-code backend
const ZOOM_CODE_BACKEND_URL = process.env.ZOOM_CODE_BACKEND_URL || 'http://localhost:8000';

// Initialize OpenAI client only if API key is available
let openai = null;

function initializeOpenAI() {
    if (!openai && process.env.OPENAI_API_KEY) {
        openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY
        });
        console.log('✅ OpenAI client initialized successfully');
    }
    return openai;
}

function isOpenAIConfigured() {
    return !!process.env.OPENAI_API_KEY;
}

// Store conversation context for each meeting
const meetingContexts = new Map();

// Store created tasks for each meeting (to avoid duplicates and provide persistence)
const meetingTasks = new Map();

// Store pending task suggestions (waiting for user approval)
const pendingTaskSuggestions = new Map();

/**
 * Helper functions for task management
 */
function addTaskToMeeting(meetingUuid, task) {
    if (!meetingTasks.has(meetingUuid)) {
        meetingTasks.set(meetingUuid, []);
    }
    
    const tasks = meetingTasks.get(meetingUuid);
    task.id = `${meetingUuid}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    task.createdAt = new Date().toISOString();
    tasks.push(task);
    
    console.log('💾 TASK SAVED TO CACHE:', {
        meetingUuid,
        taskId: task.id,
        taskType: task.taskType,
        description: task.taskDescription || task.description
    });
    
    return task;
}

function getMeetingTasks(meetingUuid) {
    return meetingTasks.get(meetingUuid) || [];
}

function isTaskSimilar(existingTask, newTaskSuggestion) {
    // Simple similarity check based on task type and description keywords
    if (existingTask.taskType !== newTaskSuggestion.taskType) {
        return false;
    }
    
    const existingDesc = (existingTask.taskDescription || existingTask.description || '').toLowerCase();
    const newDesc = (newTaskSuggestion.taskDescription || '').toLowerCase();
    
    // Check if descriptions have significant overlap
    const existingWords = existingDesc.split(' ').filter(w => w.length > 3);
    const newWords = newDesc.split(' ').filter(w => w.length > 3);
    
    const commonWords = existingWords.filter(word => newWords.includes(word));
    const similarity = commonWords.length / Math.max(existingWords.length, newWords.length);
    
    return similarity > 0.6; // 60% similarity threshold
}

function hasSimilarTask(meetingUuid, taskSuggestion) {
    const existingTasks = getMeetingTasks(meetingUuid);
    return existingTasks.some(task => isTaskSimilar(task, taskSuggestion));
}

/**
 * Analyze transcript chunks for task creation opportunities
 */
class TranscriptAnalyzer {
    constructor() {
        this.contextWindow = 10; // Keep last 10 transcript entries for context
    }

    /**
     * Add transcript to meeting context
     */
    addTranscriptToContext(meetingUuid, transcript) {
        if (!meetingContexts.has(meetingUuid)) {
            meetingContexts.set(meetingUuid, []);
        }

        const context = meetingContexts.get(meetingUuid);
        context.push({
            timestamp: new Date().toISOString(),
            speaker: transcript.speaker_name || 'Unknown',
            text: transcript.text || transcript.content
        });

        // Keep only recent context
        if (context.length > this.contextWindow) {
            context.splice(0, context.length - this.contextWindow);
        }

        dbg(`Added transcript to context for meeting ${meetingUuid}:`, transcript);
    }

    /**
     * Analyze recent transcripts for task creation opportunities
     */
    async analyzeForTasks(meetingUuid, newTranscript) {
        try {
            // Check if OpenAI is configured
            if (!isOpenAIConfigured()) {
                console.log('⚠️ OpenAI API key not configured - skipping GPT-4 analysis');
                this.addTranscriptToContext(meetingUuid, newTranscript);
                return null;
            }

            // Initialize OpenAI client if needed
            const client = initializeOpenAI();
            if (!client) {
                console.log('❌ Failed to initialize OpenAI client');
                this.addTranscriptToContext(meetingUuid, newTranscript);
                return null;
            }

            // Add new transcript to context
            this.addTranscriptToContext(meetingUuid, newTranscript);

            const context = meetingContexts.get(meetingUuid) || [];
            
            // Only analyze if we have enough context
            if (context.length < 2) {
                return null;
            }

            // Prepare conversation context for GPT-4
            const conversationText = context
                .map(entry => `${entry.speaker}: ${entry.text}`)
                .join('\n');

            // Get already created tasks for this meeting to avoid duplicates
            const existingTasks = getMeetingTasks(meetingUuid);
            const taskSummary = existingTasks.length > 0 
                ? existingTasks.map(task => `- ${task.taskType}: ${task.taskDescription || task.description}`).join('\n')
                : 'None';

            const prompt = `
Analyze the following meeting conversation transcript and determine if participants are discussing creating tasks or action items.

Look for mentions of:
- Creating Jira tickets/issues (e.g., "create a jira to fix the API", "file a bug report")
- Code/development tasks (e.g., "clone the repo", "create a branch", "add a feature", "fix the bug")
- Creating meetings (scheduling, calendar events)
- Creating documents or files
- General tasks or to-dos
- Issues or problems that need fixing
- Any other actionable items that need to be created

IMPORTANT: Determine if this is a coding/development task that requires backend execution:
- Tasks involving repos, branches, code changes, API work, development = "coding"
- Simple task creation, Jira tickets, meetings, documents = "non-coding"

ALREADY CREATED TASKS IN THIS MEETING:
${taskSummary}

DO NOT suggest tasks that are similar to or duplicate the already created tasks above.

Conversation transcript:
${conversationText}

Respond with a JSON object in this exact format:
{
    "taskDetected": true/false,
    "taskType": "jira|coding|meeting|document|task|other",
    "taskDescription": "Brief description of what needs to be created or done",
    "suggestedAction": "Specific action to take",
    "requiresBackend": true/false,
    "confidence": 0.0-1.0,
    "relevantSpeakers": ["speaker1", "speaker2"]
}

Set "requiresBackend" to true ONLY for coding/development tasks that involve:
- Repository operations (clone, branch, commit, PR)
- Code modifications or additions
- API development or fixes
- File system operations in a development context

Only respond with the JSON object, no additional text.`;

            console.log('🤖 ANALYZING TRANSCRIPT WITH GPT-4:', {
                meetingUuid,
                contextLength: context.length,
                latestSpeaker: newTranscript.speaker_name
            });

            const response = await client.chat.completions.create({
                model: "gpt-4",
                messages: [
                    {
                        role: "system",
                        content: "You are an AI assistant that analyzes meeting transcripts to identify when participants are discussing creating tasks, meetings, or other actionable items. Be precise and only detect clear intentions to create something."
                    },
                    {
                        role: "user",
                        content: prompt
                    }
                ],
                temperature: 0.3,
                max_tokens: 300
            });

            const analysis = JSON.parse(response.choices[0].message.content);
            
            console.log('✅ GPT-4 ANALYSIS COMPLETE:', analysis);

            // Only return if task is detected with reasonable confidence
            if (analysis.taskDetected && analysis.confidence > 0.6) {
                // Check if we already have a similar task for this meeting
                if (hasSimilarTask(meetingUuid, analysis)) {
                    console.log('🔄 SIMILAR TASK ALREADY EXISTS - skipping suggestion:', {
                        taskType: analysis.taskType,
                        description: analysis.taskDescription
                    });
                    return null;
                }

                const taskSuggestion = {
                    ...analysis,
                    meetingUuid,
                    timestamp: new Date().toISOString(),
                    context: context.slice(-3) // Include last 3 entries for reference
                };

                // Store as pending suggestion (waiting for user approval)
                const suggestionId = `${meetingUuid}-${Date.now()}`;
                pendingTaskSuggestions.set(suggestionId, taskSuggestion);
                taskSuggestion.suggestionId = suggestionId;

                console.log('📋 TASK SUGGESTION STORED FOR APPROVAL:', {
                    suggestionId,
                    taskType: analysis.taskType,
                    description: analysis.taskDescription
                });

                return taskSuggestion;
            }

            return null;

        } catch (error) {
            console.error('❌ GPT-4 ANALYSIS ERROR:', error);
            dbg('Error analyzing transcript:', error);
            return null;
        }
    }

    /**
     * Clear context for a meeting (when meeting ends)
     */
    clearMeetingContext(meetingUuid) {
        meetingContexts.delete(meetingUuid);
        
        // Also clear tasks and pending suggestions for this meeting
        const taskCount = meetingTasks.has(meetingUuid) ? meetingTasks.get(meetingUuid).length : 0;
        meetingTasks.delete(meetingUuid);
        
        // Clear pending suggestions for this meeting
        const pendingSuggestions = Array.from(pendingTaskSuggestions.entries())
            .filter(([id, suggestion]) => suggestion.meetingUuid === meetingUuid);
        pendingSuggestions.forEach(([id]) => pendingTaskSuggestions.delete(id));
        
        console.log('🧹 CLEARED ALL DATA FOR MEETING:', {
            meetingUuid,
            clearedTasks: taskCount,
            clearedPendingSuggestions: pendingSuggestions.length
        });
    }

    /**
     * Get current context for a meeting (for debugging)
     */
    getMeetingContext(meetingUuid) {
        return meetingContexts.get(meetingUuid) || [];
    }
}

// Export singleton instance
export const transcriptAnalyzer = new TranscriptAnalyzer();

/**
 * Send action item to zoom-code backend
 */
async function sendActionItemToBackend(analysisResult) {
    try {
        // Create a concise, actionable query for the backend
        const description = `${analysisResult.suggestedAction}. ${analysisResult.taskDescription}. Always return to main branch at the end.`;

        const requestBody = {
            query: description
        };

        console.log('🚀 SENDING ACTION ITEM TO ZOOM-CODE BACKEND:', {
            description: description
        });
        
        console.log('📤 EXACT REQUEST BODY:', JSON.stringify(requestBody, null, 2));

        const response = await fetch(`${ZOOM_CODE_BACKEND_URL}/execute`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            throw new Error(`Backend request failed: ${response.status} ${response.statusText}`);
        }

        const result = await response.json();
        console.log('✅ ZOOM-CODE BACKEND RESPONSE:', result);
        
        return {
            success: true,
            backendResponse: result,
            message: 'Action item sent to zoom-code backend successfully'
        };

    } catch (error) {
        console.error('❌ FAILED TO SEND TO ZOOM-CODE BACKEND:', error);
        return {
            success: false,
            error: error.message,
            message: 'Failed to send action item to backend'
        };
    }
}

/**
 * Task creation handlers for different task types
 */
export class TaskCreator {
    constructor() {
        this.supportedTaskTypes = ['jira', 'coding', 'meeting', 'document', 'task', 'other'];
    }

    /**
     * Create a task based on the analysis result
     */
    async createTask(analysisResult, userConfirmation = true) {
        if (!userConfirmation) {
            console.log('❌ TASK CREATION CANCELLED BY USER');
            return { success: false, reason: 'User cancelled' };
        }

        const { taskType, taskDescription, suggestedAction, requiresBackend } = analysisResult;

        console.log('🎯 CREATING TASK:', {
            type: taskType,
            description: taskDescription,
            action: suggestedAction,
            requiresBackend: requiresBackend
        });

        try {
            let result;
            switch (taskType) {
                case 'coding':
                    result = await this.createCodingTask(analysisResult);
                    break;
                case 'jira':
                    result = await this.createJiraTicket(analysisResult);
                    break;
                case 'meeting':
                    result = await this.createMeeting(analysisResult);
                    break;
                case 'document':
                    result = await this.createDocument(analysisResult);
                    break;
                case 'task':
                    result = await this.createGenericTask(analysisResult);
                    break;
                default:
                    result = await this.createGenericTask(analysisResult);
            }

            // Save the task to cache if creation was successful
            if (result.success) {
                const cachedTask = addTaskToMeeting(analysisResult.meetingUuid, {
                    ...analysisResult,
                    ...result,
                    status: 'completed'
                });
                result.cachedTask = cachedTask;

                // Remove from pending suggestions
                if (analysisResult.suggestionId) {
                    pendingTaskSuggestions.delete(analysisResult.suggestionId);
                    console.log('🗑️ REMOVED PENDING SUGGESTION:', analysisResult.suggestionId);
                }
            }

            return result;
        } catch (error) {
            console.error('❌ TASK CREATION ERROR:', error);
            return { success: false, error: error.message };
        }
    }

    async createCodingTask(analysis) {
        // This is a coding task - always send to zoom-code backend
        console.log('💻 CREATING CODING TASK:', analysis.taskDescription);
        
        const backendResult = await sendActionItemToBackend(analysis);
        
        return {
            success: true,
            taskType: 'coding',
            message: `Coding task sent to backend: ${analysis.taskDescription}`,
            details: analysis,
            backendIntegration: backendResult
        };
    }

    async createMeeting(analysis) {
        // Meeting creation - just track, don't send to backend
        console.log('📅 CREATING MEETING:', analysis.taskDescription);
        
        return {
            success: true,
            taskType: 'meeting',
            message: `Meeting task created: ${analysis.taskDescription}`,
            details: analysis,
            backendIntegration: { success: true, message: 'Meeting task tracked locally' }
        };
    }

    async createJiraTicket(analysis) {
        // Jira ticket creation - just track, don't send to backend
        console.log('🎫 CREATING JIRA TICKET:', analysis.taskDescription);
        
        return {
            success: true,
            taskType: 'jira',
            message: `Jira ticket task created: ${analysis.taskDescription}`,
            details: analysis,
            backendIntegration: { success: true, message: 'Jira ticket task tracked locally' }
        };
    }

    async createGenericTask(analysis) {
        // Generic task - only send to backend if it requires backend processing
        console.log('✅ CREATING GENERIC TASK:', analysis.taskDescription);
        
        let backendResult = { success: true, message: 'Generic task tracked locally' };
        
        if (analysis.requiresBackend) {
            console.log('🔄 TASK REQUIRES BACKEND - sending to zoom-code backend');
            backendResult = await sendActionItemToBackend(analysis);
        }
        
        return {
            success: true,
            taskType: 'task',
            message: `Task created: ${analysis.taskDescription}`,
            details: analysis,
            backendIntegration: backendResult
        };
    }

    async createDocument(analysis) {
        // Document creation - only send to backend if it requires backend processing
        console.log('📄 CREATING DOCUMENT:', analysis.taskDescription);
        
        let backendResult = { success: true, message: 'Document task tracked locally' };
        
        if (analysis.requiresBackend) {
            console.log('🔄 DOCUMENT TASK REQUIRES BACKEND - sending to zoom-code backend');
            backendResult = await sendActionItemToBackend(analysis);
        }
        
        return {
            success: true,
            taskType: 'document',
            message: `Document task created: ${analysis.taskDescription}`,
            details: analysis,
            backendIntegration: backendResult
        };
    }

    async createProject(analysis) {
        // Send to zoom-code backend for processing
        console.log('🚀 CREATING PROJECT:', analysis.taskDescription);
        
        const backendResult = await sendActionItemToBackend(analysis);
        
        return {
            success: true,
            taskType: 'project',
            message: `Project creation initiated: ${analysis.taskDescription}`,
            details: analysis,
            backendIntegration: backendResult
        };
    }
}

export const taskCreator = new TaskCreator();

/**
 * Export functions for accessing cached tasks and managing task state
 */
export function getAllMeetingTasks(meetingUuid) {
    return getMeetingTasks(meetingUuid);
}

export function getAllPendingTaskSuggestions(meetingUuid = null) {
    if (meetingUuid) {
        return Array.from(pendingTaskSuggestions.entries())
            .filter(([id, suggestion]) => suggestion.meetingUuid === meetingUuid)
            .map(([id, suggestion]) => ({ id, ...suggestion }));
    }
    return Array.from(pendingTaskSuggestions.entries())
        .map(([id, suggestion]) => ({ id, ...suggestion }));
}

export function getTaskSuggestionById(suggestionId) {
    return pendingTaskSuggestions.get(suggestionId);
}

export function approveTaskSuggestion(suggestionId) {
    const suggestion = pendingTaskSuggestions.get(suggestionId);
    if (!suggestion) {
        return { success: false, error: 'Task suggestion not found' };
    }
    
    console.log('✅ TASK SUGGESTION APPROVED:', {
        suggestionId,
        taskType: suggestion.taskType,
        description: suggestion.taskDescription
    });
    
    return taskCreator.createTask(suggestion, true);
}

export function rejectTaskSuggestion(suggestionId) {
    const suggestion = pendingTaskSuggestions.get(suggestionId);
    if (!suggestion) {
        return { success: false, error: 'Task suggestion not found' };
    }
    
    pendingTaskSuggestions.delete(suggestionId);
    
    console.log('❌ TASK SUGGESTION REJECTED:', {
        suggestionId,
        taskType: suggestion.taskType,
        description: suggestion.taskDescription
    });
    
    return { success: true, message: 'Task suggestion rejected' };
}

export function getMeetingTaskStats(meetingUuid) {
    const tasks = getMeetingTasks(meetingUuid);
    const pendingSuggestions = getAllPendingTaskSuggestions(meetingUuid);
    
    const stats = {
        totalTasks: tasks.length,
        pendingSuggestions: pendingSuggestions.length,
        tasksByType: {},
        recentTasks: tasks.slice(-5) // Last 5 tasks
    };
    
    // Count tasks by type
    tasks.forEach(task => {
        const type = task.taskType || 'unknown';
        stats.tasksByType[type] = (stats.tasksByType[type] || 0) + 1;
    });
    
    return stats;
}
