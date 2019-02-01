pragma solidity 0.4.24;

import "../QuadraticVoting.sol";

contract QuadraticVotingMock is QuadraticVoting {

  constructor() {

  }

  function voteDim(uint64 _voteId, bool _supports)  public {
    VoterState memory state_ = votes[_voteId].voters[msg.sender];
   super._vote(_voteId, _supports, state_.numberOfVotes.add(1), msg.sender);
  }

  function newVoteExt(bytes32 _executionScriptHash, string _metadata, bool _castVote)
      returns (uint256 voteId) {
      return super._newVote(_executionScriptHash, _metadata, _castVote);
  }

}
