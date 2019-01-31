/*
 * SPDX-License-Identitifer:    GPL-3.0-or-later
 */

pragma solidity >=0.4.24;

import "@aragon/os/contracts/apps/AragonApp.sol";
import "@aragon/os/contracts/common/IForwarder.sol";
import "@aragon/os/contracts/lib/math/SafeMath.sol";
import "@aragon/os/contracts/lib/math/SafeMath64.sol";


import "@aragon/apps-shared-minime/contracts/MiniMeToken.sol";

contract ApprovalVoting is IForwarder, AragonApp {
    using SafeMath for uint256;
    using SafeMath64 for uint64;

    bytes32 public constant CREATE_VOTES_ROLE = keccak256("CREATE_VOTES_ROLE");
    bytes32 public constant MODIFY_SUPPORT_ROLE = keccak256("MODIFY_SUPPORT_ROLE");
    bytes32 public constant MODIFY_QUORUM_ROLE = keccak256("MODIFY_QUORUM_ROLE");

    uint64 public constant PCT_BASE = 10 ** 18; // 0% = 0; 1% = 10^16; 100% = 10^18

    string private constant ERROR_NO_VOTE = "VOTING_NO_VOTE";
    string private constant ERROR_INIT_PCTS = "VOTING_INIT_PCTS";
    string private constant ERROR_CHANGE_SUPPORT_PCTS = "VOTING_CHANGE_SUPPORT_PCTS";
    string private constant ERROR_CHANGE_QUORUM_PCTS = "VOTING_CHANGE_QUORUM_PCTS";
    string private constant ERROR_INIT_SUPPORT_TOO_BIG = "VOTING_INIT_SUPPORT_TOO_BIG";
    string private constant ERROR_CHANGE_SUPPORT_TOO_BIG = "VOTING_CHANGE_SUPP_TOO_BIG";
    string private constant ERROR_CAN_NOT_VOTE = "VOTING_CAN_NOT_VOTE";
    string private constant ERROR_CAN_NOT_EXECUTE = "VOTING_CAN_NOT_EXECUTE";
    string private constant ERROR_CAN_NOT_FORWARD = "VOTING_CAN_NOT_FORWARD";
    string private constant ERROR_NO_VOTING_POWER = "VOTING_NO_VOTING_POWER";


    struct Vote {
        bool executed;
        uint64 startDate;
        uint64 snapshotBlock;
        uint64 minAcceptQuorum;
        uint64 totalVotes;
        bytes32[] executionHashes;
        uint256[] optionsTotals;
        mapping (address => bool[]) voters;
    }

    MiniMeToken public token;
    uint64 public minAcceptQuorum;
    uint64 public voteTime;

    // We are mimicing an array, we use a mapping instead to make app upgrade more graceful
    mapping (uint256 => Vote) internal votes;
    uint256 public votesLength;

    event StartVote(uint256 indexed voteId, address indexed creator, string metadata);
    event CastVote(uint256 indexed voteId, address indexed voter, bool[] agrees);
    event ExecuteVote(uint256 indexed voteId);
    event ChangeSupportRequired(uint64 supportRequiredPct);
    event ChangeMinQuorum(uint64 minAcceptQuorumPct);

    modifier voteExists(uint256 _voteId) {
        require(_voteId < votesLength, ERROR_NO_VOTE);
        _;
    }

    /**
    * @notice Initialize Voting app with `_token.symbol(): string` for governance, minimum support of `@formatPct(_supportRequiredPct)`%, minimum acceptance quorum of `@formatPct(_minAcceptQuorumPct)`%, and a voting duration of `@transformTime(_voteTime)`
    * @param _token MiniMeToken Address that will be used as governance token
    * @param _minAcceptQuorum Percentage of yeas in total possible votes for a vote to succeed (expressed as a percentage of 10^18; eg. 10^16 = 1%, 10^18 = 100%)
    * @param _voteTime Seconds that a vote will be open for token holders to vote (unless enough yeas or nays have been cast to make an early decision)
    */
    function initialize(
        MiniMeToken _token,
        uint64 _minAcceptQuorum,
        uint64 _voteTime
    )
        external
        onlyInit
    {
        initialized();

        token = _token;
        minAcceptQuorum = _minAcceptQuorum;
        voteTime = _voteTime;
    }


    /**
    * @notice Change minimum acceptance quorum to `@formatPct(_minAcceptQuorumPct)`%
    * @param _minAcceptQuorum New acceptance quorum
    *
    **/
    function changeMinAcceptQuorum(uint64 _minAcceptQuorum)
        external
        authP(MODIFY_QUORUM_ROLE, arr(uint256(_minAcceptQuorum), uint256(minAcceptQuorum)))
    {
        minAcceptQuorum = _minAcceptQuorum;

        emit ChangeMinQuorum(_minAcceptQuorum);
    }

    /**
    * @notice Create a new vote about "`_metadata`"
    * @param _executionHashes Hashes of EVM script options to be executed on approval. The full script shpuld be available on "`_metadata`"
    * @param _metadata Vote metadata
    * @return voteId Id for newly created vote
    */
    function newVote(bytes32[] _executionHashes, string _metadata) external auth(CREATE_VOTES_ROLE) returns (uint256 voteId) {
        return _newVote(_executionHashes, _metadata);
    }

    /**
    * @notice Choose any number of script options that you `approve`
    * @dev Initialization check is implicitly provided by `voteExists()` as new votes can only be
    *      created via `newVote(),` which requires initialization
    * @param _voteId Id for vote
    * @param _approvals Array containg booleans indicationg weather or not they support some option
    */
    function vote(uint256 _voteId, bool[] _approvals) external voteExists(_voteId) {
        require(canVote(_voteId, msg.sender), ERROR_CAN_NOT_VOTE);
        require(_approvals.length == votes[_voteId].executionHashes.length);
        _vote(_voteId, _approvals, msg.sender);
    }

    function getResults(uint256 _voteId) public view voteExists(_voteId) returns(bytes32 hash, uint256 amaout){
      Vote memory vote_ = votes[_voteId];
      uint256 index = 0;
      for(uint256 i; i < vote_.optionsTotals.length; i++){
        if(vote_.optionsTotals[i] > vote_.optionsTotals[index]) { index = i;}
      }
      return (vote_.executionHashes[index], vote_.optionsTotals[index]);
    }

    /**
    * @notice Execute vote #`_voteId`
    * @dev Initialization check is implicitly provided by `voteExists()` as new votes can only be
    *      created via `newVote(),` which requires initialization
    * @param _voteId Id for vote
    */
    function executeVote(uint256 _voteId, bytes _executionScript) external voteExists(_voteId) {
        require(canExecute(_voteId, _executionScript), ERROR_CAN_NOT_EXECUTE);
        _executeVote(_voteId, _executionScript);
    }

    function isForwarder() public pure returns (bool) {
        return true;
    }

    /**
    * @notice Creates a vote to execute the desired action, and casts a support vote if possible
    * @dev IForwarder interface conformance
    * @param _evmScriptHashes Start vote with script
    */
    function forward(bytes32[] _evmScriptHashes) public {
        require(canForward(msg.sender, _evmScriptHashes), ERROR_CAN_NOT_FORWARD);
        _newVote(_evmScriptHashes, "");
    }

    function canForward(address _sender, bytes32[] _evmScriptHashes) public view returns (bool) {
        // Note that `canPerform()` implicitly does an initialization check itself
        return canPerform(_sender, CREATE_VOTES_ROLE, arr());
    }

    function canVote(uint256 _voteId, address _voter) public view voteExists(_voteId) returns (bool) {
        Vote storage vote_ = votes[_voteId];

        return _isVoteOpen(vote_) && token.balanceOfAt(_voter, vote_.snapshotBlock) > 0;
    }

    function canExecute(uint256 _voteId, bytes _executionScript) public view voteExists(_voteId) returns (bool) {
        Vote storage vote_ = votes[_voteId];

        (bytes32 winningScritp, uint256 totalVotes) = getResults(_voteId);
        require(_verifyHash(_executionScript,winningScritp), 'INVALID EXECUTION SCRPIT');

        if (vote_.executed) {
            return false;
        }

        // Vote ended?
        if (_isVoteOpen(vote_)) {
            return false;
        }
        // Has enough support?
        if (totalVotes < vote_.minAcceptQuorum) {
            return false;
        }
        return true;
    }

    // function getVote(uint256 _voteId)
    //     public
    //     view
    //     voteExists(_voteId)
    //     returns (
    //         bool open,
    //         bool executed,
    //         uint64 startDate,
    //         uint64 snapshotBlock,
    //         uint64 supportRequired,
    //         uint64 minAcceptQuorum,
    //         uint256 yea,
    //         uint256 nay,
    //         uint256 votingPower,
    //         bytes script
    //     )
    // {
    //     Vote storage vote_ = votes[_voteId];
    //
    //     open = _isVoteOpen(vote_);
    //     executed = vote_.executed;
    //     startDate = vote_.startDate;
    //     snapshotBlock = vote_.snapshotBlock;
    //     supportRequired = vote_.supportRequiredPct;
    //     minAcceptQuorum = vote_.minAcceptQuorumPct;
    //     yea = vote_.yea;
    //     nay = vote_.nay;
    //     votingPower = vote_.votingPower;
    //     script = vote_.executionScript;
    // }

    function getVoterState(uint256 _voteId, address _voter) public view voteExists(_voteId) returns (bool[]) {
        return votes[_voteId].voters[_voter];
    }

    function _verifyHash(bytes _script, bytes32 _hash) internal returns(bool matched){
      matched = (keccak256(_script) == _hash);
    }

    function _newVote(bytes32[] _executionScriptHashes, string _metadata)
        internal
        returns (uint256 voteId)
    {
        voteId = votesLength++;
        Vote storage vote_ = votes[voteId];
        vote_.startDate = getTimestamp64();
        vote_.snapshotBlock = getBlockNumber64() - 1; // avoid double voting in this very block
        vote_.minAcceptQuorum = minAcceptQuorum;
        vote_.executionHashes = _executionScriptHashes;

        emit StartVote(voteId, msg.sender, _metadata);
    }

    function _vote(
        uint256 _voteId,
        bool[] _approves,
        address _voter
    ) internal
    {
        Vote storage vote_ = votes[_voteId];

        bool[] storage state = vote_.voters[_voter];

        for(uint64 j = 0; j < vote_.executionHashes.length; j++){
          if(_approves[j] != state[j]){
            _approves[j] ? vote_.optionsTotals[j] = vote_.optionsTotals[j].add(1) : vote_.optionsTotals[j] = vote_.optionsTotals[j].sub(1);
          }
        }

        vote_.voters[_voter] = _approves;

        emit CastVote(_voteId, _voter, _approves);
    }

    function _executeVote(uint256 _voteId, bytes _executionScript) internal {
        Vote storage vote_ = votes[_voteId];

        vote_.executed = true;

        bytes memory input = new bytes(0); // TODO: Consider input for voting scripts
        runScript(_executionScript, input, new address[](0));

        emit ExecuteVote(_voteId);
    }

    function _isVoteOpen(Vote storage vote_) internal view returns (bool) {
        return getTimestamp64() < vote_.startDate.add(voteTime) && !vote_.executed;
    }
}
