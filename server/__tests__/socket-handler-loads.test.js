import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Socket handler structural tests.
 *
 * After D8 fix: handler.js receives wired services from bootstrap.js
 * and no longer imports infrastructure adapters or application service
 * factories directly.  These tests verify the *behavioural* delegation
 * (handler calls service methods) while the bootstrap.test.js file
 * verifies the wiring lives in bootstrap.js.
 */
describe('socket handler module loads', () => {
  it('importsWithoutThrowing', async () => {
    const mod = await import('../socket/handler.js');
    expect(mod.setupSocketHandler).toBeTypeOf('function');
  });

  it('doesNotImportLegacyHistoryDbDirectly', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../socket/handler.js'), 'utf-8');

    expect(source).not.toContain("from '../db/history.js'");
  });

  it('doesNotImportLegacyClaudeServiceDirectly', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../socket/handler.js'), 'utf-8');

    expect(source).not.toContain("from '../services/claude.js'");
  });

  it('doesNotKeepDisabledLegacyRecommendationBranches', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../socket/handler.js'), 'utf-8');

    expect(source).not.toContain('__legacy_');
  });

  it('doesNotBypassMusicSourcePortForPersonalizedFallbackSearch', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../socket/handler.js'), 'utf-8');
    // The play_personalized branch has been delegated to AgentTurnService.
    // handler.js should not contain any direct netease import for this.
    expect(source).not.toContain("import('../infrastructure/netease/neteaseApi.js')");
  });

  it('delegatesChatTurnOrchestrationToAgentTurnService', () => {
    // After extraction: chat logic lives in handleChatMessage(), not between
    // socket.on markers.  Verify delegation patterns across the whole file.
    const source = fs.readFileSync(path.resolve(__dirname, '../socket/handler.js'), 'utf-8');

    expect(source).toContain('agentTurnService.handleMessage');
    expect(source).not.toContain('routeIntent(');
    expect(source).not.toContain('conversationService.handlePlanAction');
    expect(source).not.toContain('conversationService.handlePersonalizedRecommendation');
    expect(source).not.toContain('conversationService.handleRecommendationAction');
    expect(source).not.toContain('assemblePrompt({');
    expect(source).not.toContain("routing.action === 'plan_refresh'");
    expect(source).not.toContain("routing.action === 'plan_select'");
    expect(source).not.toContain("routing.action === 'plan_pin'");
    expect(source).not.toContain("routing.action === 'plan_clear'");
  });

  it('delegatesColdStartSpeechTextRulesToDomain', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../application/services/ColdStartService.js'), 'utf-8');
    const handlerSource = fs.readFileSync(path.resolve(__dirname, '../socket/handler.js'), 'utf-8');
    const coldStartStart = handlerSource.indexOf('async function triggerColdStart(');
    const coldStartEnd = handlerSource.indexOf("socket.on('client:ready'", coldStartStart);
    const coldStartHandler = handlerSource.slice(coldStartStart, coldStartEnd);

    expect(source).toContain('coldStartSpeechText');
    expect(source).toContain('coldStartRetrySpeechText');
    expect(source).toContain('shouldAttemptColdStartTts');
    expect(source).toContain('textOnlyColdStartReason');
    expect(coldStartHandler).not.toContain("replace(/<[^>]+>/g, '')");
  });

  it('delegatesColdStartTtsAndMusicStartupToColdStartService', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../socket/handler.js'), 'utf-8');
    const coldStartStart = source.indexOf('async function triggerColdStart(');
    const coldStartEnd = source.indexOf("socket.on('client:ready'", coldStartStart);
    const coldStartHandler = source.slice(coldStartStart, coldStartEnd);

    expect(coldStartHandler).toContain('coldStartService.handleGeneratedIntro');
    expect(coldStartHandler).toContain('coldStartService.startMusicDirectly');
  });

  it('delegatesColdStartReadinessAndSafetyTimeoutToColdStartService', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../socket/handler.js'), 'utf-8');
    const coldStartStart = source.indexOf('async function triggerColdStart(');
    const coldStartEnd = source.indexOf("socket.on('client:ready'", coldStartStart);
    const coldStartHandler = source.slice(coldStartStart, coldStartEnd);

    expect(coldStartHandler).toContain('coldStartService.beginIfReady');
    expect(coldStartHandler).toContain('coldStartService.startMusicIfStillInProgress');
    expect(coldStartHandler).not.toContain('queue.advance()');
    expect(coldStartHandler).not.toContain("scheduler.coldStartState = 'in-progress'");
  });

  it('delegatesColdStartWritingToColdStartService', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../socket/handler.js'), 'utf-8');
    const coldStartStart = source.indexOf('async function triggerColdStart(');
    const coldStartEnd = source.indexOf("socket.on('client:ready'", coldStartStart);
    const coldStartHandler = source.slice(coldStartStart, coldStartEnd);

    expect(coldStartHandler).toContain('coldStartService.writeIntro');
    expect(coldStartHandler).not.toContain('streamColdOpen');
    expect(coldStartHandler).not.toContain('legacyWeatherAdapter.current()');
    expect(coldStartHandler).not.toContain('getTimeOfDayMood()');
  });

  it('delegatesChatStreamingTextRulesToDomain', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../socket/handler.js'), 'utf-8');
    const serviceSource = fs.readFileSync(
      path.resolve(__dirname, '../application/services/StreamingConversationService.js'),
      'utf-8',
    );
    const chatStart = source.indexOf('socket.on(EVENTS.CHAT_MESSAGE');
    const chatEnd = source.indexOf('socket.on(EVENTS.CRAB_CLICK', chatStart);
    const chatHandler = source.slice(chatStart, chatEnd);

    expect(serviceSource).toContain('streamTokenFromChunk');
    expect(serviceSource).toContain('displayTextFromDjStream');
    expect(serviceSource).toContain('fallbackStreamEndText');
    expect(serviceSource).toContain('chatAnnouncementText');
    expect(serviceSource).toContain('shouldAnnounceChatSpeech');
    expect(chatHandler).not.toContain('JSON.parse(fullText)');
    expect(chatHandler).not.toContain('chunk.choices?.[0]?.delta?.content');
    expect(chatHandler).not.toContain('displayText.split');
  });

  it('delegatesChatStreamingLoopToStreamingConversationService', () => {
    // After extraction: streaming logic lives in handleChatMessage(), not
    // between socket.on markers.  Verify delegation across the whole file.
    const source = fs.readFileSync(path.resolve(__dirname, '../socket/handler.js'), 'utf-8');

    expect(source).not.toContain('chatWithDj');
    expect(source).toContain('streamingConversationService.streamReply');
    expect(source).toContain('streamingConversationService.synthesizeAnnouncement');
    expect(source).toContain('startChatAnnouncement');
    expect(source).not.toContain('for await (const chunk of stream)');
    expect(source).not.toContain('chatWithDj(text, contextPrompt)');
    expect(source).not.toContain("repositories.chatHistory.append('assistant'");
    expect(source).not.toContain('legacySpeechSynthAdapter.synthesize(shortText)');
  });

  it('delegatesSongRequestSearchToPlaybackService', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../socket/handler.js'), 'utf-8');
    const requestStart = source.indexOf('socket.on(EVENTS.SONG_REQUEST');
    const requestEnd = source.indexOf("socket.on('location:update'", requestStart);
    const requestHandler = source.slice(requestStart, requestEnd);

    expect(requestHandler).toContain('playbackService.requestSong');
    expect(requestHandler).not.toContain("import('../infrastructure/netease/neteaseApi.js')");
    expect(requestHandler).not.toContain('searchSongs');
  });

  it('delegatesDirectPlanBlockEventsToPlanBlockService', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../socket/handler.js'), 'utf-8');
    const planStart = source.indexOf("socket.on('plan:select-block'");
    const planEnd = source.indexOf("socket.on('proactive:toggle'", planStart);
    const planHandlers = source.slice(planStart, planEnd);

    expect(planHandlers).toContain('planBlockService.selectBlock');
    expect(planHandlers).toContain('planBlockService.pinBlock');
    expect(planHandlers).toContain('planBlockService.clearSelection');
    expect(planHandlers).not.toContain('recommender._planProgress');
    expect(planHandlers).not.toContain('recommender.fillQueue');
  });

  it('delegatesCrabClickToCrabInteractionService', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../socket/handler.js'), 'utf-8');
    const crabStart = source.indexOf('socket.on(EVENTS.CRAB_CLICK');
    const crabEnd = source.indexOf("socket.on('dj-speech-finished'", crabStart);
    const crabHandler = source.slice(crabStart, crabEnd);

    expect(crabHandler).toContain('crabInteractionService.handleInteraction');
    expect(crabHandler).not.toContain('switch (interaction)');
    expect(crabHandler).not.toContain("case 'skip'");
    expect(crabHandler).not.toContain('scheduler.skip()');
  });

  it('delegatesAuthLoginAndQrToAuthenticationService', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../socket/handler.js'), 'utf-8');
    const authStart = source.indexOf('socket.on(EVENTS.AUTH_LOGIN_PHONE');
    const authEnd = source.indexOf('function wirePlayerControls', authStart);
    const authHandlers = source.slice(authStart, authEnd);

    expect(authHandlers).toContain('authenticationService.loginWithPhone');
    expect(authHandlers).toContain('authenticationService.createQrLogin');
    expect(authHandlers).toContain('authenticationService.checkQrLogin');
    expect(authHandlers).not.toContain("import('../infrastructure/netease/neteaseApi.js')");
    expect(authHandlers).not.toContain('phoneLogin');
    expect(authHandlers).not.toContain('createQrLogin, checkQrLogin');
    expect(authHandlers).not.toContain('checkLoginStatus');
  });

  it('delegatesTransitionSpeechToDjSpeechService', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../socket/handler.js'), 'utf-8');
    const speechStart = source.indexOf('scheduler.onDjSpeechNeeded');
    const speechEnd = source.indexOf('scheduler.onStateChange', speechStart);
    const speechHandler = source.slice(speechStart, speechEnd);

    expect(speechHandler).toContain('djSpeechService.handleTransitionSpeech');
    expect(speechHandler).not.toContain('generateTransition(prevSong, nextSong');
    expect(speechHandler).not.toContain("TTS unavailable for transition");
  });

  it('delegatesRefillSpeechToDjSpeechService', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../socket/handler.js'), 'utf-8');
    const speechStart = source.indexOf('scheduler.onDjSpeechNeeded');
    const speechEnd = source.indexOf('scheduler.onStateChange', speechStart);
    const speechHandler = source.slice(speechStart, speechEnd);

    expect(speechHandler).toContain('djSpeechService.handleRefillSpeech');
    expect(speechHandler).not.toContain('generateRefillSpeech');
    expect(speechHandler).not.toContain('setTimeout(r, 2500)');
  });

  it('delegatesSpeechFinishedToSpeechCompletionService', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../socket/handler.js'), 'utf-8');
    const start = source.indexOf("socket.on('dj-speech-finished'");
    const end = source.indexOf("socket.on('plan:select-block'", start);
    const handler = source.slice(start, end);

    expect(handler).toContain('speechCompletionService.handleSpeechFinished');
    expect(handler).not.toContain("scheduler.coldStartState = 'done'");
    expect(handler).not.toContain('scheduler.startWithQueue');
    expect(handler).not.toContain('scheduler.speechComplete');
    expect(handler).not.toContain('queue.upcomingSongs');
    expect(handler).not.toContain('queue.mode');
  });

  it('delegatesDisconnectToClientLifecycleService', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../socket/handler.js'), 'utf-8');
    const start = source.indexOf("socket.on('disconnect'");
    const end = source.indexOf('// ─── Recurring tasks', start);
    const handler = source.slice(start, end);

    expect(handler).toContain('clientLifecycleService.handleDisconnect');
    expect(handler).not.toContain('scheduler.pause()');
    expect(handler).not.toContain('scheduler.playhead');
    expect(handler).not.toContain("scheduler.coldStartState = 'pending'");
  });
});
