/*
 * SPDX-License-Identitifer:    GPL-3.0-or-later
 */

 pragma solidity >=0.4.24;

import "@aragon/os/contracts/apps/AragonApp.sol";
import "@aragon/os/contracts/common/IForwarder.sol";

import "@aragon/os/contracts/lib/math/SafeMath.sol";
import "@aragon/os/contracts/lib/math/SafeMath64.sol";

import "@aragon/apps-shared-minime/contracts/MiniMeToken.sol";


contract QuadraticVoting is IForwarder, AragonApp {
    using SafeMath for uint256;
    using SafeMath64 for uint64;

    bytes32 public constant CREATE_VOTES_ROLE = keccak256("CREATE_VOTES_ROLE");
    bytes32 public constant MODIFY_SUPPORT_ROLE = keccak256("MODIFY_SUPPORT_ROLE");
    bytes32 public constant MODIFY_QUORUM_ROLE = keccak256("MODIFY_QUORUM_ROLE");

    string private constant ERROR_NO_VOTE = "VOTING_NO_VOTE";
    string private constant ERROR_INIT_PCTS = "VOTING_INIT_PCTS";
    string private constant ERROR_CHANGE_SUPPORT_PCTS = "VOTING_CHANGE_SUPPORT_PCTS";
    string private constant ERROR_CHANGE_QUORUM_PCTS = "VOTING_CHANGE_QUORUM_PCTS";
    string private constant ERROR_INIT_SUPPORT_TOO_BIG = "VOTING_INIT_SUPPORT_TOO_BIG";
    string private constant ERROR_NO_VOTING_POWER = "ERROR_NO_VOTING_POWER";
    string private constant ERROR_CAN_NOT_VOTE = "VOTING_CAN_NOT_VOTE";
    string private constant ERROR_CAN_NOT_EXECUTE = "VOTING_CAN_NOT_EXECUTE";
    string private constant ERROR_CAN_NOT_FORWARD = "VOTING_CAN_NOT_FORWARD";
    string private constant ERROR_NO_VOTING_BALANCE = "VOTING_NO_VOTING_BALANCE";

    enum VoterOptions { Absent, Yea, Nay }

    struct VoterState {
      VoterOptions option;
      uint64 numberOfVotes;
    }

    struct Vote {
        bool executed;
        uint64 startDate;
        uint64 snapshotBlock;
        uint64 supportRequired;
        uint256 yea;
        uint256 nay;
        bytes32 executionScriptHash;
        mapping (address => VoterState) voters;
    }

    MiniMeToken public token;
    uint64 public supportRequired;
    uint64 public voteTime;
    uint64 public votingPoints;
    uint64 public votingTerm; //How long a voting term lasts
    uint64 public votingTermStart;

    mapping (address => uint256) public  votingBalance;
    mapping (address => uint256) public registeredVoter;

    // We are mimicing an array, we use a mapping instead to make app upgrade more graceful
    mapping (uint256 => Vote) internal votes;
    uint256 public votesLength;

    event StartVote(uint256 indexed voteId, address indexed creator, string metadata);
    event CastVote(uint256 indexed voteId, address indexed voter, bool agree, uint256 stake);
    event ExecuteVote(uint256 indexed voteId);
    event ChangeSupportRequired(uint64 supportRequired);

    modifier voteExists(uint256 _voteId) {
        require(_voteId < votesLength, ERROR_NO_VOTE);
        _;
    }

    modifier votingTermUpdater() {
      if(votingTermStart.add(votingTerm) > now){ votingTermStart = getTimestamp64(); }
      _;
    }

    /**
    * @notice Initialize Voting app with `_token.symbol(): string` for governance, minimum support of `@formatPct(_supportRequired)`%, minimum acceptance quorum of `@formatPct(_minAcceptQuorum)`%, and a voting duration of `@transformTime(_voteTime)`
    * @param _token MiniMeToken Address that will be used as governance token
    * @param _supportRequired Percentage of yeas in casted votes for a vote to succeed (expressed as a percentage of 10^18; eg. 10^16 = 1%, 10^18 = 100%)
    * @param _voteTime Seconds that a vote will be open for token holders to vote (unless enough yeas or nays have been cast to make an early decision)
    */
    function initialize(
        MiniMeToken _token,
        uint64 _supportRequired,
        uint64 _voteTime,
        uint64 _votingPoints,
        uint64 _votingTerm
    )
        external
        onlyInit
    {
        initialized();

        token = _token;
        supportRequired = _supportRequired;
        voteTime = _voteTime;
        votingPoints = _votingPoints;
        votingTerm = _votingTerm;
        votingTermStart = getTimestamp64();
    }

    /**
* @notice Change required support to `@formatPct(_supportRequired)`%
* @param _supportRequired New required support
*/
function changeSupportRequired(uint64 _supportRequired)
    external
    authP(MODIFY_SUPPORT_ROLE, arr(uint256(_supportRequired), uint256(supportRequired)))
{
    supportRequired = _supportRequired;

    emit ChangeSupportRequired(_supportRequired);
}

    /**
    * @notice Create a new vote about "`_metadata`"
    * @param _executionScriptHash EVM script to be executed on approval
    * @param _metadata Vote metadata
    * @return voteId Id for newly created vote
    */
    function newVote(bytes32 _executionScriptHash, string _metadata) external auth(CREATE_VOTES_ROLE) returns (uint256 voteId) {
        return _newVote(_executionScriptHash, _metadata, false);
    }

    /**
    * @notice Create a new vote about "`_metadata`"
    * @param _executionScriptHash EVM script to be executed on approval
    * @param _metadata Vote metadata
    * @param _castVote Whether to also cast newly created vote
    * @return voteId id for newly created vote
    */
    function newVote(bytes32 _executionScriptHash, string _metadata, bool _castVote)
        external
        auth(CREATE_VOTES_ROLE)
        returns (uint256 voteId)
    {
        return _newVote(_executionScriptHash, _metadata, _castVote);
    }

    /**
    * @notice Vote `_supports ? 'yes' : 'no'` in vote #`_voteId`
    * @dev Initialization check is implicitly provided by `voteExists()` as new votes can only be
    *      created via `newVote(),` which requires initialization
    * @param _voteId Id for vote
    * @param _supports Whether voter supports the vote
    */
    function vote(uint256 _voteId, bool _supports) external voteExists(_voteId) {
        require(canVote(_voteId, msg.sender), ERROR_CAN_NOT_VOTE);
         VoterState memory state_ = votes[_voteId].voters[msg.sender];
        _vote(_voteId, _supports, state_.numberOfVotes.add(1), msg.sender);
    }

    /**
    * @notice Vote `_supports ? 'yes' : 'no'` in vote #`_voteId`
    * @dev Initialization check is implicitly provided by `voteExists()` as new votes can only be
    *      created via `newVote(),` which requires initialization
    * @param _voteId Id for vote
    * @param _supports Whether voter supports the vote
    * @param _amountOfVotes The number of votes to cast
    */
    function vote(uint256 _voteId, bool _supports, uint64 _amountOfVotes) external voteExists(_voteId) {
        require(canVote(_voteId, msg.sender), ERROR_CAN_NOT_VOTE);
          _vote(_voteId, _supports, _amountOfVotes, msg.sender);
    }


    function removeVote(uint256 _voteId) external voteExists(_voteId) {
      Vote storage vote_ = votes[_voteId];
      VoterState storage state = vote_.voters[msg.sender];
      require(state.numberOfVotes > 0);
      bool support_ = state.option == VoterOptions.Yea ? true : false;
      _vote(_voteId, support_, state.numberOfVotes.sub(1), msg.sender);
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
        return false;
    }

    function forward(bytes _evmScript) public {
        require(canForward(msg.sender, _evmScript), ERROR_CAN_NOT_FORWARD);
        //_newVote(bytes32(_evmScriptHash), "", true);
    }

    function canForward(address _sender, bytes _evmScript) public view returns (bool) {
        // Note that `canPerform()` implicitly does an initialization check itself
        return canPerform(_sender, CREATE_VOTES_ROLE, arr());
    }

    function canVote(uint256 _voteId, address _voter) public view voteExists(_voteId) returns (bool) {
        Vote storage vote_ = votes[_voteId];

        return _isVoteOpen(vote_) && token.balanceOfAt(_voter, vote_.snapshotBlock) > 0;
    }
    function canExecute(uint256 _voteId, bytes _executionScript) public view voteExists(_voteId) returns (bool) {
        Vote storage vote_ = votes[_voteId];

        if (vote_.executed) {
            return false;
        }
        require(_verifyHash(_executionScript,vote_.executionScriptHash), 'INVALID EXECUTION SCRPIT');

        uint256 totalVotes = vote_.yea.add(vote_.nay);
        // Vote ended?
        if (_isVoteOpen(vote_)) {
            return false;
        }
        // Has enough support?
        if (totalVotes < vote_.supportRequired) {
            return false;
        }

        // Vote was approved?
        if(vote_.yea < vote_.nay){
            return false;
        }
        return true;
    }

    function getVoterState(uint256 _voteId, address _voter) public view voteExists(_voteId) returns (VoterOptions, uint256) {
        VoterState storage state = votes[_voteId].voters[_voter];
        return (state.option, state.numberOfVotes);
    }

    function getVote(uint256 _voteId)
        public
        view
        voteExists(_voteId)
        returns (
            bool open,
            bool executed,
            uint64 startDate,
            uint64 snapshotBlock,
            uint64 supportRequired_,
            uint256 yea,
            uint256 nay,
            bytes32 scriptHash
        )
    {
        Vote storage vote_ = votes[_voteId];

        open = _isVoteOpen(vote_);
        executed = vote_.executed;
        startDate = vote_.startDate;
        snapshotBlock = vote_.snapshotBlock;
        supportRequired_ = vote_.supportRequired;
        yea = vote_.yea;
        nay = vote_.nay;
        scriptHash = vote_.executionScriptHash;
    }

    function _verifyHash(bytes _script, bytes32 _hash) internal returns(bool matched){
      matched = (keccak256(_script) == _hash);
    }


    function _newVote(bytes32 _executionScriptHash, string _metadata, bool _castVote)
        votingTermUpdater()
        internal
        returns (uint256 voteId)
    {
        //Check if token has holders
        uint256 votingPower = token.totalSupplyAt(vote_.snapshotBlock);
        require(votingPower > 0, ERROR_NO_VOTING_POWER);

        voteId = votesLength++;
        Vote storage vote_ = votes[voteId];
        vote_.startDate = getTimestamp64();
        vote_.snapshotBlock = getBlockNumber64() - 1; // avoid double voting in this very block
        vote_.supportRequired = supportRequired;
        vote_.executionScriptHash = _executionScriptHash;

        emit StartVote(voteId, msg.sender, _metadata);

        if (_castVote && canVote(voteId, msg.sender)) {
            _vote(voteId, true, 1, msg.sender);
        }
    }

    function _vote(
        uint256 _voteId,
        bool _supports,
        uint64 _numVotes,
        address _voter
    ) internal
    votingTermUpdater()
    {
        //Lazy overflow protection - There's no pow() function implemented on SafeMath
        require(_numVotes < 255 && _numVotes > 0);

        Vote storage vote_ = votes[_voteId];
        VoterState storage state = vote_.voters[_voter];

        if(state.numberOfVotes > 0) {
          uint64 invested = 2 ** state.numberOfVotes;
          votingBalance[_voter] = votingBalance[_voter].add(invested);

          // There's probably a more efficient way of checking changed votes
          if (state.option == VoterOptions.Yea) {
              vote_.yea = vote_.yea.sub(state.numberOfVotes);
          } else if (state.option == VoterOptions.Nay) {
              vote_.nay = vote_.nay.sub(state.numberOfVotes);
          }
        }

        if(registeredVoter[_voter] < votingTermStart){
          votingBalance[_voter] = votingBalance[_voter].add(votingPoints);
          registeredVoter[_voter] = getTimestamp64();
        }

        uint256 voteCost = 2 ** _numVotes;
        require(votingBalance[_voter] >= voteCost, ERROR_NO_VOTING_BALANCE);

        votingBalance[_voter] = votingBalance[_voter].sub(voteCost);

        if (_supports) {
            vote_.yea = vote_.yea.add(_numVotes);
        } else {
            vote_.nay = vote_.nay.add(_numVotes);
        }

        state.option = _supports ? VoterOptions.Yea : VoterOptions.Nay;
        state.numberOfVotes = _numVotes;
        vote_.voters[_voter] = state;

        emit CastVote(_voteId, _voter, _supports, _numVotes);
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
