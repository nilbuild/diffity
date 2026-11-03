import { describe, expect, it } from 'vitest';
import { callParts } from '../src/features/guide/guide-callstack';

describe('callParts', () => {
  it('splits a call where its arguments start', () => {
    expect(callParts('member = requirePublicationMember({ publicationId })')).toEqual(['member = requirePublicationMember', '({ publicationId })']);
    expect(callParts('POST /invites/:id/respond { accept }')).toEqual(['POST /invites/:id/respond ', '{ accept }']);
  });

  it('keeps a row without arguments whole', () => {
    expect(callParts('res.end')).toEqual(['res.end', '']);
  });
});
