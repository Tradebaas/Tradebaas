#!/bin/bash
cd /root/Tradebaas
node direct-test.js
sleep 1
if [ -f test-result.json ]; then
    echo "Test succeeded:"
    cat test-result.json
else
    echo "Test failed - no result file created"
fi
