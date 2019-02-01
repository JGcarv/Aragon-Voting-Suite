pragma solidity 0.4.24;

import "@aragon/os/contracts/apps/AragonApp.sol";
import "@aragon/os/contracts/common/IForwarder.sol";

import "@aragon/os/contracts/lib/math/SafeMath.sol";
import "@aragon/os/contracts/lib/math/SafeMath64.sol";

import "@aragon/apps-shared-minime/contracts/MiniMeToken.sol";

import "./Utils/Voting.sol";

contract SingleDelegationVote is Voting {

  // using SafeMath for uint256;
  // using SafeMath64 for uint64;
    //
    // MiniMeToken public token;
    // uint64 public supportRequiredPct;
    // uint64 public minAcceptQuorumPct;
    // uint64 public voteTime;
    //
    // // We are mimicing an array, we use a mapping instead to make app upgrade more graceful
    // mapping (uint256 => Vote) internal votes;
    // uint256 public votesLength;


    // SINGLE DELEGATION DATA STRUCTURES
    mapping (address => address) public representatives;
    mapping (address => uint256) public gasCreditsBalance;

    mapping (address => mapping(uint256 => address)) public representeds;
    mapping (address => uint256) representedsLength;

    mapping (uint256 => mapping(address => bool)) public voted;
    mapping (uint256 => mapping(address => uint256)) public votedStake;

  /**
    ------------------------------------------------------

                  DELEGATING FUNCTIONS

    -------------------------------------------------------
  **/

  /**
  TODO
  1 -implement check for not enouh balance
  2 - Should consider if represented already voted
  3 - Bound the iteration so it's wwhitin the block limit
  This is where the expensive stuff is
  **/
  function getDelegatorStake(uint256 voteId, uint256 snapshotBlock) internal returns(uint256 totalStake){
    address _representative = msg.sender;
    totalStake = 0;
    address _represented;
    for(uint256 i = 0; i < representedsLength[_representative]; i++) {
      _represented = representeds[_representative][i];

      bool hasVoted = voted[voteId][_represented];
      bool isRepresented = representatives[_represented] == msg.sender;

      if(!hasVoted && isRepresented && gasCreditsBalance[_represented] > 10) {
        totalStake = totalStake.add(token.balanceOfAt(_represented, snapshotBlock));
        transferGasCredits(representeds[_representative][i], _representative, 10);
      }
    }
  }

  function pruneRepresentedList(address _representative) public {
    address _represented;
    for(uint256 i = 0; i < representedsLength[_representative]; i++) {
      _represented = representeds[_representative][i];
      bool isRepresented = representatives[_represented] == msg.sender;

      if(_represented != address(0) && !isRepresented && gasCreditsBalance[_represented] < 10) {
        removeRepresented(_representative,_represented,i);
        i--; //Repeat this index because last index has been placed here
      }
    }
  }

  function removeRepresented(address _representative, address _represented, uint _index) internal {
    require(representeds[_representative][_index] == _represented);
    //Add overflow protetion
    uint256 lastIndex = representedsLength[_representative] - 1;
    if(_index == lastIndex) {
      delete representeds[_representative][_index];
    }
    else {
      // Copy the last place to index
      representeds[_representative][_index] = representeds[_representative][lastIndex];
      //Delete last
      delete representeds[_representative][lastIndex];
    }
    representedsLength[_representative] = representedsLength[_representative].sub(1);
  }

  function delegateVote(address _representative) payable {
    representatives[msg.sender] = _representative;
    gasCreditsBalance[msg.sender] = gasCreditsBalance[msg.sender].add(msg.value);
    uint256 _index = representedsLength[_representative];
    representeds[_representative][_index] = msg.sender;
    representedsLength[_representative]++;
  }


  /**
    ------------------------------------------------------

                  GAS CREDIT RELATED FUNCTIONS

    -------------------------------------------------------
  **/

    function depoistGasCredits() public {
      require(msg.value > 0);
      gasCreditsBalance[msg.sender] = gasCreditsBalance[msg.sender].add(msg.value);
    }

    function withdrawGasCredits(uint256 _amount) public {
      require(_amount <=  gasCreditsBalance[msg.sender]);
      gasCreditsBalance[msg.sender] = gasCreditsBalance[msg.sender].sub(_amount);
      msg.sender.transfer(_amount);
    }

    function transferGasCredits(address from, address to, uint256 amount) internal {
      require(amount <= gasCreditsBalance[from]);
      gasCreditsBalance[from] = gasCreditsBalance[from].sub(amount);
      gasCreditsBalance[to] = gasCreditsBalance[to].add(amount);
    }


    /**
      ------------------------------------------------------

                    OVERRIDEN FUNCTIONS

      -------------------------------------------------------
    **/
    function _vote(
        uint256 _voteId,
        bool _supports,
        address _voter,
        bool _executesIfDecided
    ) internal
    {
      /**
      TODO implement changing votes
      **/
      require(!voted[_voteId][_voter]);
      // _voter is someone's representative?
      if (representedsLength[_voter] > 0) {
        _voteAsRepresentative(_voteId,_supports,_voter);
      }
        _voteAsIndividual(_voteId,_supports,_voter);

      if (_executesIfDecided && canExecute(_voteId)) {
          _executeVote(_voteId);
      }
    }


    /**
      ------------------------------------------------------

                    VOTING FUNCTIONS

      -------------------------------------------------------
    **/

  function _voteAsIndividual(
    uint256 _voteId,
    bool _supports,
    address _voter
  ) internal
  {
      Vote storage vote_ = votes[_voteId];
      VoterState option = _supports ? VoterState.Yea : VoterState.Nay;
      address _representative = representatives[_voter];

      uint256 stake;
      if(_representative == address(0) || !voted[_voteId][_representative]) {
        //If you'r voting for yourself
        stake = token.balanceOfAt(_voter, vote_.snapshotBlock);
          if(_supports) {
            vote_.yea = vote_.nay.add(stake);
          } else {
            vote_.nay = vote_.nay.add(stake);
          }

          votedStake[_voteId][_voter] = votedStake[_voteId][_voter].add(stake);
          voted[_voteId][_voter] = true; //Setting this will avoid your representative from voting for you
      }

      //If you have a representative and she already voted
      if(voted[_voteId][_representative]) {
        // If your votes are the same
          if (vote_.voters[_representative] == option) { return; }
        // else
        stake = token.balanceOfAt(_voter, vote_.snapshotBlock);
        votedStake[_voteId][_representative] = votedStake[_voteId][_representative].sub(stake);
        votedStake[_voteId][_voter] = votedStake[_voteId][_voter].add(stake);
        voted[_voteId][_voter] = true;

        if(option == VoterState.Yea) {
          vote_.nay = vote_.nay.sub(stake);
          vote_.yea = vote_.nay.add(stake);
        } else {
          vote_.nay = vote_.nay.add(stake);
          vote_.yea = vote_.nay.sub(stake);
        }
      }

      vote_.voters[_voter] = _supports ? VoterState.Yea : VoterState.Nay;

      emit CastVote(_voteId, _voter, _supports, stake);
 }

  function _voteAsRepresentative(
    uint256 _voteId,
    bool _supports,
    address _voter
  ) internal
  {
    Vote storage vote_ = votes[_voteId];
    VoterState option = _supports ? VoterState.Yea : VoterState.Nay;

    // This could re-enter, though we can assume the governance token is not malicious
    uint256 voterStake = getDelegatorStake(_voteId, vote_.snapshotBlock);
    VoterState state = vote_.voters[_voter];


    if (_supports) {
        vote_.yea = vote_.yea.add(voterStake);
    } else {
        vote_.nay = vote_.nay.add(voterStake);
    }

    vote_.voters[_voter] = _supports ? VoterState.Yea : VoterState.Nay;

    emit CastVote(_voteId, _voter, _supports, voterStake);
  }
}