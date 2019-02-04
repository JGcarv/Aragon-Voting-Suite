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
const QuadraticVoting = artifacts.require('QuadraticVotingMock')

const BN = web3.utils.BN;

const getContract = name => artifacts.require(name)
const bigExp = (x, y) => new BN(x).mul(new BN(10 ** y))
// const pct16 = x => bigExp(x, 16)
const startVoteEvent = receipt => receipt.logs.filter(x => x.event == 'StartVote')[0].args
const createdVoteId = receipt => startVoteEvent(receipt).voteId

const ANY_ADDR = '0xffffffffffffffffffffffffffffffffffffffff'
const NULL_ADDRESS = '0x0000000000000000000000000000000000000000'

const VOTER_STATE = ['ABSENT', 'YEA', 'NAY'].reduce((state, key, index) => {
    state[key] = index;
    return state;
}, {})


contract('Quadratic Voting App', accounts => {
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
        votingBase = await QuadraticVoting.new()

        // Setup constants
        APP_MANAGER_ROLE = await kernelBase.APP_MANAGER_ROLE()
        CREATE_VOTES_ROLE = await votingBase.CREATE_VOTES_ROLE()
        MODIFY_SUPPORT_ROLE = await votingBase.MODIFY_SUPPORT_ROLE()
    })

    beforeEach(async () => {
        const r = await daoFact.newDAO(root)
        const dao = await Kernel.at(r.logs.filter(l => l.event == 'DeployDAO')[0].args.dao)
        const acl = await ACL.at(await dao.acl())
        await acl.createPermission(root, dao.address, APP_MANAGER_ROLE, root, { from: root })

        const receipt = await dao.newAppInstance('0x1234', votingBase.address, '0x', false, { from: root })
        voting = await QuadraticVoting.at(receipt.logs.filter(l => l.event == 'NewAppProxy')[0].args.proxy)
        await acl.createPermission(ANY_ADDR, voting.address, CREATE_VOTES_ROLE, root, { from: root })
        await acl.createPermission(ANY_ADDR, voting.address, MODIFY_SUPPORT_ROLE, root, { from: root })
        //await acl.createPermission(ANY_ADDR, voting.address, MODIFY_QUORUM_ROLE, root, { from: root })
    })

    context('normal token supply, common tests', () => {
        const holder20 = accounts[0]
        const holder29 = accounts[1]
        const holder51 = accounts[2]
        const nonHolder = accounts[4]

        const neededSupport = new BN(4);
        const votingTerm = 3600;
        const votingPoints = 32;

        beforeEach(async () => {
            token = await MiniMeToken.new(NULL_ADDRESS, NULL_ADDRESS, 0, 'n', 0, 'n', true) // empty parameters minime
            await voting.initialize(token.address, neededSupport,votingTime, votingPoints, votingTerm)

            executionTarget = await ExecutionTarget.new()
        })

        // it('fails on reinitialization', async () => {
        //     return assertRevert(async () => {
        //         await voting.initialize(token.address, neededSupport,votingTime, votingPoints, votingTerm)
        //     })
        // })
        //
        // it('cannot initialize base app', async () => {
        //     const newVoting = await QuadraticVoting.new()
        //     assert.isTrue(await newVoting.isPetrified())
        //     return assertRevert(async () => {
        //         await newVoting.initialize(token.address, neededSupport,votingTime, votingPoints, votingTerm)
        //     })
        // })
        //
        // it('checks it is forwarder', async () => {
        //     assert.isFalse(await voting.isForwarder())
        // })
        //
        // it('can change required support', async () => {
        //     const receipt = await voting.changeSupportRequired(neededSupport + 1);
        //     const events = receipt.logs.filter(x => x.event == 'ChangeSupportRequired')
        //
        //     assert.equal(events.length, 1, 'should have emitted ChangeSupportRequired event')
        //     assert.equal((await voting.supportRequired()).toString(), (neededSupport + 1).toString(), 'should have changed required support')
        // })
        //
        // it('fails changing required support lower than minimum acceptance quorum', async () => {
        //     return assertRevert(async () => {
        //         await voting.changeSupportRequired(minimumAcceptanceQuorum.minus(1))
        //     })
        // })
        //
        // it('fails changing required support to 100% or more', async () => {
        //     await assertRevert(async () => {
        //         await voting.changeSupportRequiredPct(pct16(101))
        //     })
        //     return assertRevert(async () => {
        //         await voting.changeSupportRequiredPct(pct16(100))
        //     })
        // })
        //
        // it('can change minimum acceptance quorum', async () => {
        //     const receipt = await voting.changeMinAcceptQuorumPct(1)
        //     const events = receipt.logs.filter(x => x.event == 'ChangeMinQuorum')
        //
        //     assert.equal(events.length, 1, 'should have emitted ChangeMinQuorum event')
        //     assert.equal(await voting.minAcceptQuorumPct(), 1, 'should have changed acceptance quorum')
        // })
        //
        // it('fails changing minimum acceptance quorum to greater than min support', async () => {
        //     return assertRevert(async () => {
        //         await voting.changeMinAcceptQuorumPct(neededSupport.plus(1))
        //     })
        // })

      })

      context(`normal token supply, 0 decimals`, () => {
            const decimals = 0;
            const holder20 = accounts[0]
            const holder29 = accounts[1]
            const holder51 = accounts[2]
            const nonHolder = accounts[4]

            const neededSupport = new BN(5);
            const votingTerm = 3600;
            const votingPoints = new BN(64);

            beforeEach(async () => {
                token = await MiniMeToken.new(NULL_ADDRESS, NULL_ADDRESS, 0, 'n', decimals, 'n', true) // empty parameters minime

                await token.generateTokens(holder20, bigExp(20, decimals))
                await token.generateTokens(holder29, bigExp(29, decimals))
                await token.generateTokens(holder51, bigExp(51, decimals))

                await voting.initialize(token.address, neededSupport,votingTime, votingPoints, votingTerm)

                executionTarget = await ExecutionTarget.new()
            })

            // it('deciding voting is automatically executed', async () => {
            //     const action = { to: executionTarget.address, calldata: executionTarget.contract.execute.getData() }
            //     const script = encodeCallScript([action])
            //     await voting.newVote(script, '', { from: holder51 })
            //     assert.equal(await executionTarget.counter(), 1, 'should have received execution call')
            // })
            //
            // it('deciding voting is automatically executed (long version)', async () => {
            //     const action = { to: executionTarget.address, calldata: executionTarget.contract.execute.getData() }
            //     const script = encodeCallScript([action])
            //     await voting.newVoteExt(script, '', true, true, { from: holder51 })
            //     assert.equal(await executionTarget.counter(), 1, 'should have received execution call')
            // })
            //
            // it('execution scripts can execute multiple actions', async () => {
            //     const action = { to: executionTarget.address, calldata: executionTarget.contract.execute.getData() }
            //     const script = encodeCallScript([action, action, action])
            //     await voting.newVote(script, '', { from: holder51 })
            //     assert.equal(await executionTarget.counter(), 3, 'should have executed multiple times')
            // })
            //
            // it('execution script can be empty', async () => {
            //     await voting.newVote(encodeCallScript([]), '', { from: holder51 })
            // })
            //
            // it('execution throws if any action on script throws', async () => {
            //     const action = { to: executionTarget.address, calldata: executionTarget.contract.execute.getData() }
            //     let script = encodeCallScript([action])
            //     script = script.slice(0, -2) // remove one byte from calldata for it to fail
            //     return assertRevert(async () => {
            //         await voting.newVote(script, '', { from: holder51 })
            //     })
            // })
            //
            // it('forwarding creates vote', async () => {
            //     const action = { to: executionTarget.address, calldata: executionTarget.contract.execute.getData() }
            //     const script = encodeCallScript([action])
            //     const voteId = createdVoteId(await voting.forward(script, { from: holder51 }))
            //     assert.equal(voteId, 0, 'voting should have been created')
            // })

            context('Quadratic Mechanism', () => {
              let script, scriptHash, voteId, creator, metadata

              beforeEach(async () => {
                  const action = { to: executionTarget.address, calldata: "0x61461954" }
                  script = encodeCallScript([action, action])
                  scriptHash = sha3(script);
                  const startVote = startVoteEvent(await voting.newVote(scriptHash, 'metadata',{ from: holder51 }))
                  voteId = startVote.voteId
                  creator = startVote.creator
                  metadata = startVote.metadata
              })

              it('holder can vote', async () => {
                  await voting.vote(voteId, false, 1,{ from: holder29 })
                  const state = await voting.getVote(voteId)
                  const voterState = await voting.getVoterState(voteId, holder29)

                  assert.equal(state[6].toString(), "1", 'nay vote should have been counted')
                  assert.equal(voterState[0], VOTER_STATE.NAY, 'holder29 should have nay voter status')
              })

              it('holder can cast multiple votes ', async () => {
                  await voting.vote(voteId, false, 2,{ from: holder29 })
                  const state = await voting.getVote(voteId)
                  const voterState = await voting.getVoterState(voteId, holder29)

                  assert.equal(state[6].toString(), "2", 'nay vote should have been counted')
                  assert.equal(voterState[0], VOTER_STATE.NAY, 'holder29 should have nay voter status')
              })

              it('Votes are correctly priced', async () => {
                  const numberOfVotes = new BN(3);
                  const cost = new BN(numberOfVotes.pow(new BN(2)));

                  await voting.vote(voteId, false, 3,{ from: holder29 })
                  const balance = await voting.votingBalance(holder29);

                  const state = await voting.getVote(voteId)
                  const voterState = await voting.getVoterState(voteId, holder29)
                  assert.isTrue(votingPoints.eq(balance.add(cost)))
                  assert.isTrue(state[6].eq(numberOfVotes), 'nay vote should have been counted')
                  assert.equal(voterState[0], VOTER_STATE.NAY, 'holder29 should have nay voter status')
              })

              it('Refunds voting balances correctly', async() => {
                const numberOfVotes = new BN(2);
                const cost = new BN(numberOfVotes.pow(new BN(2)));

                await voting.vote(voteId, false, 3,{ from: holder29 })
                const balance1 = await voting.votingBalance(holder29);
                await voting.vote(voteId, true, 2,{ from: holder29 })
                const balance2 = await voting.votingBalance(holder29);

                const state = await voting.getVote(voteId)
                const voterState = await voting.getVoterState(voteId, holder29)
                assert.isTrue(votingPoints.eq(balance2.add(cost)))
                assert.isTrue(balance2.sub(balance1).eq(new BN(4)))
                assert.isTrue(state[5].eq(numberOfVotes), 'nay vote should have been counted')
                assert.equal(voterState[0], VOTER_STATE.YEA, 'holder29 should have nay voter status')
              })

              it('Can remove votes', async() => {
                const numberOfVotes = new BN(2);
                const cost = new BN(numberOfVotes.pow(new BN(2)));

                await voting.vote(voteId, false, 3,{ from: holder29 })
                await voting.removeVote(voteId,{ from: holder29 })

                const state = await voting.getVote(voteId)
                const voterState = await voting.getVoterState(voteId, holder29)
                const balance = await voting.votingBalance(holder29);

                assert.isTrue(votingPoints.eq(balance.add(cost)))
                assert.isTrue(state[6].eq(numberOfVotes), 'nay vote should have been counted')
                assert.equal(voterState[0], VOTER_STATE.NAY, 'holder29 should have nay voter status')
              })

              it('fails fails to remove vote from non voter', async () => {
                  return assertRevert(async () => {
                      await voting.removeVote(voteId,{ from: holder29 })
                  })
              })
            })

            context('Voting Term Mechanism', () => {
                let script, scriptHash, voteId, creator, metadata

                beforeEach(async () => {
                    const action = { to: executionTarget.address, calldata: "0x61461954" }
                    script = encodeCallScript([action, action])
                    scriptHash = sha3(script);
                    const startVote = startVoteEvent(await voting.newVote(scriptHash, 'metadata',{ from: holder51 }))
                    voteId = startVote.voteId
                    creator = startVote.creator
                    metadata = startVote.metadata
                })

                it('Voting term is set properly', async () => {
                    const term = await voting.votingTerm()
                    assert.isTrue(term.eq(new BN(votingTerm)), 'voting term should be equal')
                })

                it('Voting term updates correctly', async () => {
                    await voting.vote(voteId, false, 1,{ from: holder51 })
                    await timeTravel(votingTerm + 1)
                    const action = { to: executionTarget.address, calldata: "0x61461954" }
                    script = encodeCallScript([action, action])
                    scriptHash = sha3(script);
                    const startVote = startVoteEvent(await voting.newVote(scriptHash, 'metadata',{ from: holder51 }))
                    voteId = startVote.voteId
                    const bal = await voting.votingBalance(holder51)
                    await voting.vote(voteId, false, 1,{ from: holder51 })
                    console.log(bal);
                    console.log(votingPoints);
                    let expectedBalance = new BN(62)
                    assert.isTrue(bal.eq(1), 'Holder should have correctt balance')
                })
            })

            context('creating vote', () => {
                let script, scriptHash, voteId, creator, metadata

                beforeEach(async () => {
                    const action = { to: executionTarget.address, calldata: "0x61461954" }
                    script = encodeCallScript([action, action])
                    scriptHash = sha3(script);
                    const startVote = startVoteEvent(await voting.newVote(scriptHash, 'metadata',{ from: holder51 }))
                    voteId = startVote.voteId
                    creator = startVote.creator
                    metadata = startVote.metadata
                })

                it('has correct state', async () => {
                const results = Object.values(await voting.getVote(voteId));
                const [isOpen, isExecuted, startDate, snapshotBlock, supportRequired, y, n, execScript] = results;

                    assert.isTrue(isOpen, 'vote should be open')
                    assert.isFalse(isExecuted, 'vote should not be executed')
                    assert.equal(creator, holder51, 'creator should be correct')
                    assert.equal(snapshotBlock, await getBlockNumber() - 1, 'snapshot block should be correct')
                    assert.isTrue(supportRequired.eq(neededSupport), 'required support should be app required support')
                    assert.equal(y, 0, 'initial yea should be 0')
                    assert.equal(n, 0, 'initial nay should be 0')
                    assert.equal(execScript, scriptHash, 'script should be correct')
                    assert.equal(metadata, 'metadata', 'should have returned correct metadata')
                    let state = await voting.getVoterState(voteId, nonHolder)
                    assert.isTrue(state[0].eq(new BN(0)), 'nonHolder should not have voted')
                })

                it('fails getting a vote out of bounds', async () => {
                    return assertRevert(async () => {
                        await voting.getVote(voteId + 1)
                    })
                })

                it('changing required support does not affect vote required support', async () => {
                    await voting.changeSupportRequired(10)

                    // With previous required support at 50%, vote should be approved
                    // with new quorum at 70% it shouldn't have, but since min quorum is snapshotted
                    // it will succeed

                    await voting.vote(voteId, true, 1, { from: holder51 })
                    await timeTravel(votingTime + 1)

                    const state = await voting.getVote(voteId)
                    assert.equal(state[4].toNumber(), neededSupport.toNumber(), 'required support in vote should stay equal')
                })

                it('holder can vote', async () => {
                    await voting.vote(voteId, false, 1,{ from: holder29 })
                    const state = await voting.getVote(voteId)
                    const voterState = await voting.getVoterState(voteId, holder29)

                    assert.equal(state[6].toString(), "1", 'nay vote should have been counted')
                    assert.equal(voterState[0], VOTER_STATE.NAY, 'holder29 should have nay voter status')
                })

                it('holder can modify vote', async () => {
                    await voting.vote(voteId, true, 1,{ from: holder29 })
                    await voting.vote(voteId, false, 1,{ from: holder29 })
                    await voting.vote(voteId, true, 1,{ from: holder29 })
                    const state = await voting.getVote(voteId)

                    assert.equal(state[5].toString(), "1", 'yea vote should have been counted')
                    assert.equal(state[6], 0, 'nay vote should have been removed')
                })

                it('Holder can cast multiple votes', async() => {
                  await voting.voteDim(voteId, false,{ from: holder29 })
                  await voting.voteDim(voteId, false,{ from: holder29 })
                  await voting.voteDim(voteId, false,{ from: holder29 })

                  const state = await voting.getVote(voteId)
                  assert.equal(state[6].toString(), "3", 'yea vote should have been counted 3 times')
                })

                it('throws when non-holder votes', async () => {
                    return assertRevert(async () => {
                        await voting.vote(voteId, true, 1, { from: nonHolder })
                    })
                })

                it('throws when voting after voting closes', async () => {
                    await timeTravel(votingTime + 1)
                    return assertRevert(async () => {
                        await voting.vote(voteId, true, 1, { from: holder29 })
                    })
                })

                it('can execute if vote is approved with support and quorum', async () => {
                    await voting.vote(voteId, true, 4, { from: holder29 })
                    await voting.vote(voteId, false, 1, { from: holder20 })
                    await timeTravel(votingTime + 1)
                    await voting.executeVote(voteId, script)
                    assert.equal(await executionTarget.counter(), 2, 'should have executed result')
                })

                it('cannot execute vote if not support met', async () => {
                    await voting.vote(voteId, true, 1, { from: holder29 })
                    await voting.vote(voteId, true, 1, { from: holder20 })
                    await timeTravel(votingTime + 1)
                    return assertRevert(async () => {
                        await voting.executeVote(voteId, script)
                    })
                })


                it('cannot re-execute vote', async () => {
                    await voting.vote(voteId, true, 5, { from: holder51 })
                    await timeTravel(votingTime + 1)
                    await voting.executeVote(voteId, script) // causes execution
                    return assertRevert(async () => {
                        await voting.executeVote(voteId, script)
                    })
                })

                it('cannot vote on executed vote', async () => {
                  await voting.vote(voteId, true, 5, { from: holder51 })
                  await timeTravel(votingTime + 1)
                  await voting.executeVote(voteId, script) // causes execution
                    return assertRevert(async () => {
                        await voting.vote(voteId, true, 1, { from: holder20 })
                    })
                })
            })
         })

    context('empty token', () => {
        const neededSupport = new BN(4);
        const votingTerm = 3600;
        const votingPoints = 32;

        beforeEach(async() => {
            token = await MiniMeToken.new(NULL_ADDRESS, NULL_ADDRESS, 0, 'n', 0, 'n', true) // empty parameters minime

            await voting.initialize(token.address, neededSupport,votingTime, votingPoints, votingTerm)
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
