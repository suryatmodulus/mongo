/**
 * Tests that writes are disallowed while in kCommitted.
 *
 * @tags: [
 * ]
 */
(function() {
"use strict";

load("jstests/sharding/libs/resharding_test_fixture.js");

const reshardingTest = new ReshardingTest();
reshardingTest.setup();

const dbName = "test";
const collName = "foo";
const ns = dbName + "." + collName;

const donorShardNames = reshardingTest.donorShardNames;
printjson("donorShardNames: " + donorShardNames);
const sourceCollection = reshardingTest.createShardedCollection({
    ns: ns,
    shardKeyPattern: {oldKey: 1},
    chunks: [
        {min: {oldKey: MinKey}, max: {oldKey: 0}, shard: donorShardNames[0]},
        {min: {oldKey: 0}, max: {oldKey: MaxKey}, shard: donorShardNames[0]},
    ],
});

assert.commandWorked(sourceCollection.insert({_id: 0, oldKey: -20, newKey: 20, yak: 50}));

const recipientShardNames = reshardingTest.recipientShardNames;
reshardingTest.withReshardingInBackground(
    {
        newShardKeyPattern: {newKey: 1},
        newChunks: [{min: {newKey: MinKey}, max: {newKey: MaxKey}, shard: recipientShardNames[0]}],
    },
    (tempNs) => {},
    {
        postCheckConsistencyFn: (tempNs) => {
            jsTestLog("Attempting insert");
            let res = sourceCollection.runCommand({
                insert: collName,
                documents: [{_id: 1, oldKey: -10, newKey: 10}],
                maxTimeMS: 5000
            });
            assert(ErrorCodes.isExceededTimeLimitError(res.writeErrors[0].code));

            jsTestLog("Attempting update");
            res = sourceCollection.runCommand({
                update: collName,
                updates: [{q: {_id: 0}, u: {$set: {newKey: 15}}}],
                maxTimeMS: 5000
            });
            assert(ErrorCodes.isExceededTimeLimitError(res.writeErrors[0].code));

            jsTestLog("Attempting delete");
            res = sourceCollection.runCommand({
                delete: collName,
                deletes: [{q: {_id: 0, oldKey: -20}, limit: 1}],
                maxTimeMS: 5000
            });
            assert(ErrorCodes.isExceededTimeLimitError(res.writeErrors[0].code));

            jsTestLog("Attempting createIndex");
            res = sourceCollection.runCommand({
                createIndexes: collName,
                indexes: [{key: {yak: 1}, name: "yak_0"}],
                maxTimeMS: 5000
            });
            assert(ErrorCodes.isExceededTimeLimitError(res.code));

            jsTestLog("Attempting collMod");

            assert.commandFailedWithCode(
                // The collMod is serialized with the resharding command, so we explicitly add an
                // timeout to the command so that it doesn't get blocked and timeout the test.
                sourceCollection.runCommand({collMod: sourceCollection.getName(), maxTimeMS: 5000}),
                [ErrorCodes.ReshardCollectionInProgress, ErrorCodes.MaxTimeMSExpired]);

            jsTestLog("Attempting drop index");
            assert.commandFailedWithCode(
                sourceCollection.runCommand({dropIndexes: collName, index: {oldKey: 1}}),
                ErrorCodes.ReshardCollectionInProgress);

            jsTestLog("Completed operations");
        },
        afterReshardingFn: (tempNS) => {
            jsTestLog("Join possible ongoing collMod command");
            assert.commandWorked(sourceCollection.runCommand("collMod"));
        }
    });

jsTestLog("Verify that writes succeed after resharding operation has completed");

assert.commandWorked(sourceCollection.runCommand(
    {insert: collName, documents: [{_id: 1, oldKey: -10, newKey: 10}]}));

assert.commandWorked(sourceCollection.runCommand(
    {update: collName, updates: [{q: {_id: 0, newKey: 20}, u: {$set: {oldKey: 15}}}]}));

assert.commandWorked(sourceCollection.runCommand(
    {delete: collName, deletes: [{q: {_id: 0, oldKey: -20}, limit: 1}]}));

assert.commandWorked(sourceCollection.runCommand(
    {createIndexes: collName, indexes: [{key: {yak: 1}, name: "yak_0"}]}));

assert.commandWorked(sourceCollection.runCommand({collMod: sourceCollection.getName()}));

assert.commandWorked(sourceCollection.runCommand({dropIndexes: collName, index: {oldKey: 1}}));

assert.commandWorked(sourceCollection.runCommand({drop: collName}));

reshardingTest.teardown();
})();
