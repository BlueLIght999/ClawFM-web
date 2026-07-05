import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('socket handler module loads', () => {
  it('importsWithoutThrowing', async () => {
    const mod = await import('../socket/handler.js');
    expect(mod.setupSocketHandler).toBeTypeOf('function');
  });

  it('delegatesPlaybackControlsToPlaybackService', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../socket/handler.js'), 'utf-8');

    expect(source).toContain('createPlaybackService');
  });

  it('delegatesFastChatControlsToConversationService', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../socket/handler.js'), 'utf-8');

    expect(source).toContain('createConversationService');
  });

  it('doesNotImportLegacyHistoryDbDirectly', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../socket/handler.js'), 'utf-8');

    expect(source).not.toContain("from '../db/history.js'");
  });

  it('doesNotKeepDisabledLegacyRecommendationBranches', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../socket/handler.js'), 'utf-8');

    expect(source).not.toContain('__legacy_');
  });

  it('doesNotBypassMusicSourcePortForPersonalizedFallbackSearch', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../socket/handler.js'), 'utf-8');
    const start = source.indexOf("if (routing.action === 'play_personalized')");
    const end = source.indexOf("if (['reject_recommend'", start);
    const personalizedBranch = source.slice(start, end);

    expect(personalizedBranch).not.toContain("import('../services/netease.js')");
  });

  it('delegatesChatPlanActionsToConversationService', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../socket/handler.js'), 'utf-8');
    const chatStart = source.indexOf('socket.on(EVENTS.CHAT_MESSAGE');
    const chatEnd = source.indexOf('socket.on(EVENTS.CRAB_CLICK', chatStart);
    const chatHandler = source.slice(chatStart, chatEnd);

    expect(chatHandler).toContain('conversationService.handlePlanAction');
    expect(chatHandler).not.toContain("routing.action === 'plan_refresh'");
    expect(chatHandler).not.toContain("routing.action === 'plan_select'");
    expect(chatHandler).not.toContain("routing.action === 'plan_pin'");
    expect(chatHandler).not.toContain("routing.action === 'plan_clear'");
  });

  it('delegatesColdStartSpeechTextRulesToDomain', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../application/services/ColdStartService.js'), 'utf-8');
    const handlerSource = fs.readFileSync(path.resolve(__dirname, '../socket/handler.js'), 'utf-8');
    const coldStartStart = handlerSource.indexOf('async function triggerColdStart()');
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
    const coldStartStart = source.indexOf('async function triggerColdStart()');
    const coldStartEnd = source.indexOf("socket.on('client:ready'", coldStartStart);
    const coldStartHandler = source.slice(coldStartStart, coldStartEnd);

    expect(source).toContain('createColdStartService');
    expect(coldStartHandler).toContain('coldStartService.handleGeneratedIntro');
    expect(coldStartHandler).toContain('coldStartService.startMusicDirectly');
  });

  it('delegatesColdStartReadinessAndSafetyTimeoutToColdStartService', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../socket/handler.js'), 'utf-8');
    const coldStartStart = source.indexOf('async function triggerColdStart()');
    const coldStartEnd = source.indexOf("socket.on('client:ready'", coldStartStart);
    const coldStartHandler = source.slice(coldStartStart, coldStartEnd);

    expect(coldStartHandler).toContain('coldStartService.beginIfReady');
    expect(coldStartHandler).toContain('coldStartService.startMusicIfStillInProgress');
    expect(coldStartHandler).not.toContain('queue.advance()');
    expect(coldStartHandler).not.toContain("scheduler.coldStartState = 'in-progress'");
  });

  it('delegatesColdStartWritingToColdStartService', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../socket/handler.js'), 'utf-8');
    const coldStartStart = source.indexOf('async function triggerColdStart()');
    const coldStartEnd = source.indexOf("socket.on('client:ready'", coldStartStart);
    const coldStartHandler = source.slice(coldStartStart, coldStartEnd);

    expect(source).toContain('legacyColdOpenWriter');
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
    const source = fs.readFileSync(path.resolve(__dirname, '../socket/handler.js'), 'utf-8');
    const chatStart = source.indexOf('socket.on(EVENTS.CHAT_MESSAGE');
    const chatEnd = source.indexOf('socket.on(EVENTS.CRAB_CLICK', chatStart);
    const chatHandler = source.slice(chatStart, chatEnd);

    expect(source).toContain('createStreamingConversationService');
    expect(chatHandler).toContain('streamingConversationService.streamReply');
    expect(source).toContain('streamingConversationService.synthesizeAnnouncement');
    expect(chatHandler).toContain('startChatAnnouncement');
    expect(chatHandler).not.toContain('for await (const chunk of stream)');
    expect(chatHandler).not.toContain('chatWithDj(text, contextPrompt)');
    expect(chatHandler).not.toContain("repositories.chatHistory.append('assistant'");
    expect(chatHandler).not.toContain('legacySpeechSynthAdapter.synthesize(shortText)');
  });

  it('delegatesSongRequestSearchToPlaybackService', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../socket/handler.js'), 'utf-8');
    const requestStart = source.indexOf('socket.on(EVENTS.SONG_REQUEST');
    const requestEnd = source.indexOf("socket.on('location:update'", requestStart);
    const requestHandler = source.slice(requestStart, requestEnd);

    expect(requestHandler).toContain('playbackService.requestSong');
    expect(requestHandler).not.toContain("import('../services/netease.js')");
    expect(requestHandler).not.toContain('searchSongs');
  });

  it('delegatesAuthLoginAndQrToAuthenticationService', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../socket/handler.js'), 'utf-8');
    const authStart = source.indexOf('socket.on(EVENTS.AUTH_LOGIN_PHONE');
    const authEnd = source.indexOf('// === Player Controls ===', authStart);
    const authHandlers = source.slice(authStart, authEnd);

    expect(source).toContain('createAuthenticationService');
    expect(authHandlers).toContain('authenticationService.loginWithPhone');
    expect(authHandlers).toContain('authenticationService.createQrLogin');
    expect(authHandlers).toContain('authenticationService.checkQrLogin');
    expect(authHandlers).not.toContain("import('../services/netease.js')");
    expect(authHandlers).not.toContain('phoneLogin');
    expect(authHandlers).not.toContain('createQrLogin, checkQrLogin');
    expect(authHandlers).not.toContain('checkLoginStatus');
  });

  it('delegatesTransitionSpeechToDjSpeechService', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../socket/handler.js'), 'utf-8');
    const speechStart = source.indexOf('scheduler.onDjSpeechNeeded');
    const speechEnd = source.indexOf('scheduler.onStateChange', speechStart);
    const speechHandler = source.slice(speechStart, speechEnd);

    expect(source).toContain('createDjSpeechService');
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
});
