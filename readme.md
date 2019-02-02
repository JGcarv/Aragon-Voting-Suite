# Aragon Voting Suite

Toy project to learn how to build and interact with the Aragon ecosystem.

Caution: This is a WIP, not all features are tested or even implemented and this code hasn't been through an audit process.

In this repo there're currently 3 contracts:

### Single Delegation Vote
This is an adaptation of the existing Voting App that adds the functionality of voting delegation, an important piece for building Liquid Democracy,

>Delegative democracy, also known as liquid democracy,[1] is a form of democracy whereby an electorate has the option of vesting voting power in delegates rather than voting directly themselves.

 [Wikipedia](https://en.wikipedia.org/wiki/Delegative_democracy).

A true Delegative Democracy would need multiple levels of delegation, meaning that a representative should be able to delegating his total stake to a third party. This brings a lot of technical challenges and there's no clear solution on how to implement it securely.

##### Gas costs for delegation

In this thread in the [Aragon Forum](https://forum.aragon.org/t/voting-v1-single-delegation/440), there a discussion about the technical details of single vote delegation, specially on who should pay for the extra gas costs of delegating.

The naive approach is that representative pays for it, since she is the one make the transaction and therefore is paying for gas. There's also the possibility that a hook on token transfers that handles a live balance of stakes for delegates.

I propose another way that neither the delegate nor every holder pays the price, but the voter who is being represented. The rationale is that individual voter pays their own gas costs and the same should be true for everyone. In this implementation when you choose a delegate you pay upfront for the gas and it can be claimed later by the representative. I used simple ETH, but this could be implemented with any token, including [Gas Token](https://gastoken.io/).

ps. This can also be useful to refund other actions taken on behalf of the organization, like executing a decided vote.

### Quadratic Vote

Is a voting system developed by economist Steven P. Lalley and E. Glen Weyl which allows voters to cast both their preference and the intensity for preference for each decision. [Wikipedia](https://en.wikipedia.org/wiki/Quadratic_vo)

It's said to achieve maximum satisfaction among group members. Different the the current voting app in this contract holders have a fixed amount of voting credits during each term and they can decide to cast more than one vote in each proposal, but for each new vote it's cost doubles.    

For this to happen though it's important to move from the plutocratic weighted vote to a kind of one-person-one-vote mechanic, which is harder to fine tune parameters like support and quorum since the total number of holders of a token is unknown  


### Approval Vote

Is a voting mechanic in which each voter can select one or more option from an array of options. And the end of the voting period, the option with most votes is the winner. [Wikipedia](https://en.wikipedia.org/wiki/Approval_voting)

This also has some other very nice properties in the case where a winner must be selected.

I can imagine some interesting use cases in the contexts of DAOs. A obvious on is to vote on [Flock Proposals](https://github.com/aragon/flock)

Instead of the current binary scheme, where holders either approve or disapprove a proposal, teams could submit multiple variations and see which gets the maximum number of approvals.


Also, Instead of submiting an `script` when creating a vote, users submit the hash of the script which is then verified when execution is made. This can save a lot of gas in the long term. Another option is to create "executor" contracts that be destroyed after the execution to receive gas refunds.

### Resources
If you would like to discover more about voting schmes, here're are some resources:
* [To Build a Better Ballot](https://ncase.me/ballot/)
* [Electoral Systems](https://en.wikipedia.org/wiki/Electoral_system)

ps. I am far from being an expert in voting mechanics so take everything here with a grain of salt.
