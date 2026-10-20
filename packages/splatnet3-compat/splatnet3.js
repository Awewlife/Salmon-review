// SPDX-License-Identifier: AGPL-3.0-or-later
// Independent runtime adapter. See provenance.json and NOTICE for constant sources.
import queries from './queries.json' with {type: 'json'};
import enums from './enums.json' with {type: 'json'};
import provenance from './provenance.json' with {type: 'json'};

const ids = {...queries};
for (const name of provenance.unsupportedQueries) {
  Object.defineProperty(ids, name, {enumerable: true, get() {
    const error = new Error(`SplatNet query ${name} has been removed upstream; this adapter does not substitute an unrelated query.`);
    error.code = 'ERR_SPLATNET_QUERY_REMOVED';
    throw error;
  }});
}
export const RequestId = new Proxy(Object.freeze(ids), {
  get(target, name, receiver) {
    if (typeof name === 'string' && !Reflect.has(target, name)) {
      const error = new Error(`Unreviewed SplatNet query ${name}; update the compatibility contract before upgrading nxapi.`);
      error.code = 'ERR_SPLATNET_QUERY_UNREVIEWED';
      throw error;
    }
    return Reflect.get(target, name, receiver);
  },
});
export const FestState = Object.freeze(enums.FestState);
export const FestVoteState = Object.freeze(enums.FestVoteState);
export const FriendOnlineState = Object.freeze(enums.FriendOnlineState);
export const CoopRule = Object.freeze(enums.CoopRule);
export const Judgement = Object.freeze(enums.Judgement);
export const BankaraMatchMode = Object.freeze(enums.BankaraMatchMode);
export const FestMatchMode = Object.freeze(enums.FestMatchMode);
