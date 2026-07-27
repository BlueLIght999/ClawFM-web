import { describe, expect, it, beforeEach } from 'vitest';
import { createRoomService } from '../application/services/RoomService.js';

function makeMockRepo() {
  const rooms = new Map();
  return {
    rooms,
    createRoom: ({ roomId, hostUserId, name, topicTags }) => {
      const room = { roomId, hostUserId, name, topicTags, status: 'active', createdAt: new Date().toISOString() };
      rooms.set(roomId, room);
      return room;
    },
    getRoom: (roomId) => rooms.get(roomId) || null,
    listRooms: (activeOnly) => [...rooms.values()].filter((r) => !activeOnly || r.status === 'active'),
    endRoom: (roomId) => { const r = rooms.get(roomId); if (r) r.status = 'ended'; },
  };
}

function makePublisher() {
  const roomEmits = [];
  return { roomEmits, emitToRoom: (event, payload, roomId) => { roomEmits.push({ event, payload, roomId }); } };
}

let repo, publisher;
beforeEach(() => { repo = makeMockRepo(); publisher = makePublisher(); });

describe('room service', () => {
  it('createRoom_generatesRoomIdAndPersists', () => {
    const service = createRoomService({ communityRepository: repo, eventPublisher: publisher });
    const r = service.createRoom({ hostUserId: 'u1', name: '夜猫房', topicTags: ['rock'] });
    expect(r.ok).toBe(true);
    expect(r.room.roomId).toMatch(/^room_/);
    expect(r.room.hostUserId).toBe('u1');
    expect(r.room.topicTags).toEqual(['rock']);
    expect(r.room.status).toBe('active');
    expect(repo.rooms.has(r.room.roomId)).toBe(true);
  });

  it('createRoom_requiresHost', () => {
    const service = createRoomService({ communityRepository: repo, eventPublisher: publisher });
    expect(service.createRoom({ name: 'x' }).ok).toBe(false);
  });

  it('joinRoom_returnsActiveRoom', () => {
    const service = createRoomService({ communityRepository: repo, eventPublisher: publisher });
    const created = service.createRoom({ hostUserId: 'u1', name: 'r' });
    const r = service.joinRoom(created.room.roomId, 'u2');
    expect(r.ok).toBe(true);
    expect(r.room.roomId).toBe(created.room.roomId);
  });

  it('joinRoom_rejectsEndedRoom', () => {
    const service = createRoomService({ communityRepository: repo, eventPublisher: publisher });
    const created = service.createRoom({ hostUserId: 'u1', name: 'r' });
    service.endRoom(created.room.roomId, 'u1');
    const r = service.joinRoom(created.room.roomId, 'u2');
    expect(r.ok).toBe(false);
    expect(r.error).toBe('room_ended');
  });

  it('joinRoom_rejectsMissing', () => {
    const service = createRoomService({ communityRepository: repo, eventPublisher: publisher });
    expect(service.joinRoom('ghost', 'u2').ok).toBe(false);
  });

  it('hostControl_broadcastsStateWhenHost', () => {
    const service = createRoomService({ communityRepository: repo, eventPublisher: publisher });
    const created = service.createRoom({ hostUserId: 'u1', name: 'r' });
    const r = service.hostControl(created.room.roomId, 'u1', { isPlaying: true, currentIndex: 2, currentSong: { id: 's1' } });
    expect(r.ok).toBe(true);
    expect(r.payload.isPlaying).toBe(true);
    expect(r.payload.currentIndex).toBe(2);
    expect(publisher.roomEmits.length).toBe(1);
    expect(publisher.roomEmits[0].event).toBe('room:state');
    expect(publisher.roomEmits[0].roomId).toBe(created.room.roomId);
  });

  it('hostControl_deniedForNonHost', () => {
    const service = createRoomService({ communityRepository: repo, eventPublisher: publisher });
    const created = service.createRoom({ hostUserId: 'u1', name: 'r' });
    const r = service.hostControl(created.room.roomId, 'u2', { isPlaying: true });
    expect(r.ok).toBe(false);
    expect(r.error).toBe('not_host_or_inactive');
    expect(publisher.roomEmits.length).toBe(0);
  });

  it('endRoom_onlyHostCanEnd', () => {
    const service = createRoomService({ communityRepository: repo, eventPublisher: publisher });
    const created = service.createRoom({ hostUserId: 'u1', name: 'r' });
    expect(service.endRoom(created.room.roomId, 'u2').ok).toBe(false);
    expect(service.endRoom(created.room.roomId, 'u1').ok).toBe(true);
    expect(repo.rooms.get(created.room.roomId).status).toBe('ended');
    // endRoom 也广播一次结束状态
    expect(publisher.roomEmits.length).toBe(1);
  });

  it('listRooms_returnsActiveByDefault', () => {
    const service = createRoomService({ communityRepository: repo, eventPublisher: publisher });
    service.createRoom({ hostUserId: 'u1', name: 'a' });
    const b = service.createRoom({ hostUserId: 'u1', name: 'b' });
    service.endRoom(b.room.roomId, 'u1');
    expect(service.listRooms().length).toBe(1);
    expect(service.listRooms(false).length).toBe(2);
  });

  it('getRoom_returnsNullForMissing', () => {
    const service = createRoomService({ communityRepository: repo, eventPublisher: publisher });
    expect(service.getRoom('ghost')).toBeNull();
  });
});
