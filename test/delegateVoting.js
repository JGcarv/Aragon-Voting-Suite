const sha3 = require('solidity-sha3').default

const { assertRevert } = require('@aragon/test-helpers/assertThrow')
const getBlockNumber = require('@aragon/test-helpers/blockNumber')(web3)
const timeTravel = require('@aragon/test-helpers/timeTravel')(web3)
const { encodeCallScript, EMPTY_SCRIPT } = require('@aragon/test-helpers/evmScript')
const ExecutionTarget = artifacts.require('ExecutionTarget')

const DAOFactory = artifacts.require('../node_modules/@aragon/os/contracts/factory/DAOFactory')
const EVMScriptRegistryFactory = artifacts.require('@aragon/os/contracts/factory/EVMScriptRegistryFactory')
const ACL = artifacts.require('@aragon/os/contracts/acl/ACL')
const Kernel = artifacts.require('@aragon/os/contracts/kernel/Kernel')

const MiniMeToken = artifacts.require('@aragon/apps-shared-minime/contracts/MiniMeToken')
const SingleDelegation = artifacts.require('SingleDelegationVote')

const BN = web3.utils.BN;

const getContract = name => artifacts.require(name)
const bigExp = (x, y) => new BN(x).mul(new BN(10).pow(new BN(y)));
const pct16 = x => bigExp(x, 16);
const startVoteEvent = receipt => receipt.logs.filter(x => x.event == 'StartVote')[0].args
const createdVoteId = receipt => startVoteEvent(receipt).voteId

const ANY_ADDR = '0xffffffffffffffffffffffffffffffffffffffff'
const NULL_ADDRESS = '0x0000000000000000000000000000000000000000'

const VOTER_STATE = ['ABSENT', 'YEA', 'NAY'].reduce((state, key, index) => {
    state[key] = index;
    return state;
}, {})


contract('Delegate Voting App', accounts => {
    let votingBase, daoFact, voting, token, executionTarget

    let APP_MANAGER_ROLE
    let CREATE_VOTES_ROLE, MODIFY_SUPPORT_ROLE, MODIFY_QUORUM_ROLE

    const votingTime = 1000
    const decimals = 18
    const root = accounts[0]

    before(async () => {
        const kernelBase = await getContract('Kernel').new(true) // petrify immediately
        const aclBase = await getContract('ACL').new()
        const regFact = await EVMScriptRegistryFactory.new()

        daoFact = await DAOFactory.new(kernelBase.address, aclBase.address, regFact.address)

        votingBase = await SingleDelegation.new()
        APP_MANAGER_ROLE = await kernelBase.APP_MANAGER_ROLE()
        CREATE_VOTES_ROLE = await votingBase.CREATE_VOTES_ROLE()
        MODIFY_SUPPORT_ROLE = await votingBase.MODIFY_SUPPORT_ROLE()
        MODIFY_QUORUM_ROLE = await votingBase.MODIFY_QUORUM_ROLE()
    })

    beforeEach(async () => {
        const r = await daoFact.newDAO(root)
        const dao = await Kernel.at(r.logs.filter(l => l.event == 'DeployDAO')[0].args.dao)
        const acl = await ACL.at(await dao.acl())
        await acl.createPermission(root, dao.address, APP_MANAGER_ROLE, root, { from: root })
        const receipt = await dao.newAppInstance('0x1234', votingBase.address, '0x', false, { from: root })
        voting = await SingleDelegation.at(receipt.logs.filter(l => l.event == 'NewAppProxy')[0].args.proxy)
        await acl.createPermission(ANY_ADDR, voting.address, CREATE_VOTES_ROLE, root, { from: root })
        await acl.createPermission(ANY_ADDR, voting.address, MODIFY_SUPPORT_ROLE, root, { from: root })
        await acl.createPermission(ANY_ADDR, voting.address, MODIFY_QUORUM_ROLE, root, { from: root })
    })

    context('normal token supply, common tests', () => {
        const holder20 = accounts[0]
        const holder29 = accounts[1]
        const holder51 = accounts[2]
        const nonHolder = accounts[4]

        const neededSupport = pct16(50)
        const minimumAcceptanceQuorum = pct16(20)
        const votingTerm = 3600;
        const votingPoints = 32;

        beforeEach(async () => {
            token = await MiniMeToken.new(NULL_ADDRESS, NULL_ADDRESS, 0, 'n', 0, 'n', true) // empty parameters minime
            await voting.initialize(token.address, neededSupport, minimumAcceptanceQuorum, votingTime)

            executionTarget = await ExecutionTarget.new()
        })

        it('fails on reinitialization', async () => {
            return assertRevert(async () => {
                await voting.initialize(token.address, neededSupport, minimumAcceptanceQuorum, votingTime)
            })
        })

        it('cannot initialize base app', async () => {
            const newVoting = await SingleDelegation.new()
            assert.isTrue(await newVoting.isPetrified())
            return assertRevert(async () => {
                await newVoting.initialize(token.address, neededSupport, minimumAcceptanceQuorum, votingTime)
            })
        })

        it('checks it is forwarder', async () => {
            assert.isTrue(await voting.isForwarder())
        })

      })

      context('Delegating Mechanisms', () => {
          const holder20 = accounts[0]
          const holder29 = accounts[1]
          const holder51 = accounts[2]
          const nonHolder = accounts[4]

          const neededSupport = pct16(50)
          const minimumAcceptanceQuorum = pct16(20)

          beforeEach(async () => {
            token = await MiniMeToken.new(NULL_ADDRESS, NULL_ADDRESS, 0, 'n', decimals, 'n', true) // empty parameters minime

            await token.generateTokens(holder20, bigExp(20, decimals))
            await token.generateTokens(holder29, bigExp(29, decimals))
            await token.generateTokens(holder51, bigExp(51, decimals))

            await voting.initialize(token.address, neededSupport, minimumAcceptanceQuorum, votingTime)

            executionTarget = await ExecutionTarget.new()
            const action = { to: executionTarget.address, calldata: "0x61461954" }
            script = encodeCallScript([action, action])
            const startVote = startVoteEvent(await voting.newVoteExt(script, 'metadata', false, false, { from: holder51 }))
            voteId = startVote.voteId
            creator = startVote.creator
            metadata = startVote.metadata
          })

          it('holder can delegate a vote ', async () => {
              await voting.delegateVote(holder29, {from:holder20, value:1000});
              await voting.vote(voteId, false, true, { from: holder29 });
              const state = await voting.getVote(voteId)
              const voterState = await voting.getVoterState(voteId, holder29)

              assert.equal(state[7].toString(), bigExp(49, decimals).toString(), 'nay vote should have been counted')
              assert.equal(voterState, VOTER_STATE.NAY, 'holder29 should have nay voter status')
          })

          it('Multiple holders can have the same delegate ', async () => {
              await voting.delegateVote(holder29, {from:holder20, value:1000});
              await voting.delegateVote(holder29, {from:holder51, value:1000});
              await voting.vote(voteId, false, true, { from: holder29 });
              const state = await voting.getVote(voteId)
              const voterState = await voting.getVoterState(voteId, holder29)

              assert.equal(state[7].toString(), bigExp(100, decimals).toString(), 'nay vote should have been counted')
              assert.equal(voterState, VOTER_STATE.NAY, 'holder29 should have nay voter status')
          })

          it('Holder can change her stake of delegate vote', async () => {
              await voting.delegateVote(holder29, {from:holder20, value:1000});
              await voting.vote(voteId, false, false, { from: holder29 });
              await voting.vote(voteId, true, false, { from: holder20 });
              const state = await voting.getVote(voteId)
              const voterState29 = await voting.getVoterState(voteId, holder29)
              const voterState20 = await voting.getVoterState(voteId, holder20)
              assert.equal(state[6].toString(), bigExp(20, decimals).toString(), 'yea vote should have been counted')
              assert.equal(state[7].toString(), bigExp(29, decimals).toString(), 'nay vote should have been counted')
              assert.equal(voterState29, VOTER_STATE.NAY, 'holder29 should have nay voter status')
              assert.equal(voterState20, VOTER_STATE.YEA, 'holder20 should have yea voter status')
            })

            it('Holder can vote before her delegate vote', async () => {
                await voting.delegateVote(holder29, {from:holder20, value:1000});
                await voting.vote(voteId, true, false, { from: holder20 });
                await voting.vote(voteId, false, false, { from: holder29 });
                const state = await voting.getVote(voteId)
                const voterState29 = await voting.getVoterState(voteId, holder29)
                const voterState20 = await voting.getVoterState(voteId, holder20)

                assert.equal(state[6].toString(), bigExp(20, decimals).toString(), 'yea vote should have been counted')
                assert.equal(state[7].toString(), bigExp(29, decimals).toString(), 'nay vote should have been counted')
                assert.equal(voterState29, VOTER_STATE.NAY, 'holder29 should have nay voter status')
                assert.equal(voterState20, VOTER_STATE.YEA, 'holder20 should have yea voter status')
              })

            it('Delegator can delegate its own vote', async () => {
              await voting.delegateVote(holder29, {from:holder20, value:1000});
              await voting.delegateVote(holder51, {from:holder29, value:1000});
              await voting.vote(voteId, true, false, { from: holder29 });
              await voting.vote(voteId, false, false, { from: holder51 });
              const state = await voting.getVote(voteId)
              const voterState29 = await voting.getVoterState(voteId, holder29)
              const voterState51 = await voting.getVoterState(voteId, holder51)
              assert.equal(state[6].toString(), bigExp(49, decimals).toString(), 'yea vote should have been counted')
              assert.equal(state[7].toString(), bigExp(51, decimals).toString(), 'nay vote should have been counted')
              assert.equal(voterState29, VOTER_STATE.YEA, 'holder29 should have nay voter status')
              assert.equal(voterState51, VOTER_STATE.NAY, 'holder51 should have nay voter status')
            })


        })


      for (const decimals of [0/**, 2, 18, 26**/]) {
              context(`normal token supply, ${decimals} decimals`, () => {
                  const holder20 = accounts[0]
                  const holder29 = accounts[1]
                  const holder51 = accounts[2]
                  const nonHolder = accounts[4]

                  const neededSupport = pct16(50)
                  const minimumAcceptanceQuorum = pct16(20)

                  beforeEach(async () => {
                      token = await MiniMeToken.new(NULL_ADDRESS, NULL_ADDRESS, 0, 'n', decimals, 'n', true) // empty parameters minime

                      await token.generateTokens(holder20, bigExp(20, decimals))
                      await token.generateTokens(holder29, bigExp(29, decimals))
                      await token.generateTokens(holder51, bigExp(51, decimals))

                      await voting.initialize(token.address, neededSupport, minimumAcceptanceQuorum, votingTime)

                      executionTarget = await ExecutionTarget.new()
                  })

                  it('deciding voting is automatically executed', async () => {
                      const action = { to: executionTarget.address, calldata: "0x61461954" }
                      const script = encodeCallScript([action])
                      await voting.newVote(script, '', { from: holder51 })
                      let target = await executionTarget.counter();
                      assert.equal(await executionTarget.counter(), 1, 'should have received execution call')
                  })

                  it('deciding voting is automatically executed (long version)', async () => {
                      const action = { to: executionTarget.address, calldata: "0x61461954" }
                      const script = encodeCallScript([action])
                      await voting.newVoteExt(script, '', true, true, { from: holder51 })
                      assert.equal(await executionTarget.counter(), 1, 'should have received execution call')
                  })

                  it('execution scripts can execute multiple actions', async () => {
                      const action = { to: executionTarget.address, calldata: "0x61461954" }
                      const script = encodeCallScript([action, action, action])
                      await voting.newVote(script, '', { from: holder51 })
                      assert.equal(await executionTarget.counter(), 3, 'should have executed multiple times')
                  })

                  it('execution script can be empty', async () => {
                      await voting.newVote(encodeCallScript([]), '', { from: holder51 })
                  })

                  it('execution throws if any action on script throws', async () => {
                      const action = { to: executionTarget.address, calldata: "0x61461954" }
                      let script = encodeCallScript([action])
                      script = script.slice(0, -2) // remove one byte from calldata for it to fail
                      return assertRevert(async () => {
                          await voting.newVote(script, '', { from: holder51 })
                      })
                  })

                  context('creating vote', () => {
                      let script, voteId, creator, metadata

                      beforeEach(async () => {
                          const action = { to: executionTarget.address, calldata: "0x61461954" }
                          script = encodeCallScript([action, action])
                          const startVote = startVoteEvent(await voting.newVoteExt(script, 'metadata', false, false, { from: holder51 }))
                          voteId = startVote.voteId
                          creator = startVote.creator
                          metadata = startVote.metadata
                      })

                      it('has correct state', async () => {
                          const results = Object.values(await voting.getVote(voteId));
                          const [isOpen, isExecuted, startDate, snapshotBlock, supportRequired, minQuorum, y, n, votingPower, execScript] = results

                          assert.isTrue(isOpen, 'vote should be open')
                          assert.isFalse(isExecuted, 'vote should not be executed')
                          assert.equal(creator, holder51, 'creator should be correct')
                          assert.equal(snapshotBlock, await getBlockNumber() - 1, 'snapshot block should be correct')
                          assert.isTrue(supportRequired.eq(neededSupport), 'required support should be app required support')
                          assert.isTrue(minQuorum.eq(minimumAcceptanceQuorum), 'min quorum should be app min quorum')
                          assert.equal(y, 0, 'initial yea should be 0')
                          assert.equal(n, 0, 'initial nay should be 0')
                          assert.equal(votingPower.toString(), bigExp(100, decimals).toString(), 'total voters should be 100')
                          assert.equal(execScript, script, 'script should be correct')
                          assert.equal(metadata, 'metadata', 'should have returned correct metadata')
                          assert.equal(await voting.getVoterState(voteId, nonHolder), VOTER_STATE.ABSENT, 'nonHolder should not have voted')
                      })

                      it('fails getting a vote out of bounds', async () => {
                          return assertRevert(async () => {
                              await voting.getVote(voteId + 1)
                          })
                      })

                      it('holder can vote', async () => {
                          await voting.vote(voteId, false, true, { from: holder29 })
                          const state = await voting.getVote(voteId)
                          const voterState = await voting.getVoterState(voteId, holder29)

                          assert.equal(state[7].toString(), bigExp(29, decimals).toString(), 'nay vote should have been counted')
                          assert.equal(voterState, VOTER_STATE.NAY, 'holder29 should have nay voter status')
                      })

                      it('token transfers dont affect voting', async () => {
                          await token.transfer(nonHolder, bigExp(29, decimals), { from: holder29 })

                          await voting.vote(voteId, true, true, { from: holder29 })
                          const state = await voting.getVote(voteId)

                          assert.equal(state[6].toString(), bigExp(29, decimals).toString(), 'yea vote should have been counted')
                          assert.equal(await token.balanceOf(holder29), 0, 'balance should be 0 at current block')
                      })

                      it('throws when non-holder votes', async () => {
                          return assertRevert(async () => {
                              await voting.vote(voteId, true, true, { from: nonHolder })
                          })
                      })

                      it('throws when voting after voting closes', async () => {
                          await timeTravel(votingTime + 1)
                          return assertRevert(async () => {
                              await voting.vote(voteId, true, true, { from: holder29 })
                          })
                      })

                      it('can execute if vote is approved with support and quorum', async () => {
                          await voting.vote(voteId, true, true, { from: holder29 })
                          //await voting.vote(voteId, false, true, { from: holder20 })
                          await timeTravel(votingTime + 1)
                          await voting.executeVote(voteId)
                          assert.equal(await executionTarget.counter(), 4, 'should have executed result')
                      })

                      it('vote can be executed automatically if decided', async () => {
                          await voting.vote(voteId, true, true, { from: holder51 }) // causes execution
                          assert.equal(await executionTarget.counter(), 2, 'should have executed result')
                      })

                      it('vote can be not executed automatically if decided', async () => {
                          await voting.vote(voteId, true, false, { from: holder51 }) // doesnt cause execution
                          await voting.executeVote(voteId)
                          assert.equal(await executionTarget.counter(), 2, 'should have executed result')
                      })

                      it('cannot vote on executed vote', async () => {
                          await voting.vote(voteId, true, true, { from: holder51 }) // causes execution
                          return assertRevert(async () => {
                              await voting.vote(voteId, true, true, { from: holder20 })
                          })
                      })
                  })
              })
          }

    context('empty token', () => {
        const votingTerm = 3600;
        const votingPoints = 32;
        const neededSupport = pct16(50)
        const minimumAcceptanceQuorum = pct16(20)

        beforeEach(async() => {
            token = await MiniMeToken.new(NULL_ADDRESS, NULL_ADDRESS, 0, 'n', 0, 'n', true) // empty parameters minime

            await voting.initialize(token.address, neededSupport, minimumAcceptanceQuorum, votingTime)
        })

        it('fails creating a survey if token has no holder', async () => {
            return assertRevert(async () => {
              await voting.newVote(EMPTY_SCRIPT, 'metadata')
            })
        })
    })


    context('before init', () => {
        it('fails creating a vote before initialization', async () => {
            return assertRevert(async () => {
                await voting.newVote(encodeCallScript([]), '')
            })
        })
    })

  })
