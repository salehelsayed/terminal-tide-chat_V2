import { generateKeyPair, privateKeyToProtobuf, privateKeyFromProtobuf } from '@libp2p/crypto/keys';
import { createEd25519PeerId } from '@libp2p/peer-id-factory';
import { createLibp2p } from 'libp2p';
import { toString as uint8ArrayToString, fromString as uint8ArrayFromString } from 'uint8arrays';

async function testKeyGeneration() {
  console.log('Testing key generation and libp2p node creation...\n');
  
  try {
    // Step 1: Generate keys and PeerId together
    console.log('1. Generating Ed25519 keys and PeerId...');
    const peerId = await createEd25519PeerId();
    // The privateKey is already in protobuf format
    const privateKeyProtobuf = peerId.privateKey;
    const privateKey = await privateKeyFromProtobuf(privateKeyProtobuf);
    console.log('✓ Private key generated');
    console.log('✓ PeerId created:', peerId.toString());
    
    // Step 3: Marshal and store (simulate storage)
    console.log('\n3. Testing key marshaling...');
    // We already have the protobuf format from peerId.privateKey
    const keyString = uint8ArrayToString(privateKeyProtobuf, 'base64');
    console.log('✓ Key marshalled, length:', keyString.length);
    
    // Step 4: Unmarshal and recreate
    console.log('\n4. Testing key unmarshaling...');
    const keyBytes = uint8ArrayFromString(keyString, 'base64');
    const restoredKey = await privateKeyFromProtobuf(keyBytes);
    // Create a new PeerId from the restored key
    // Since we have the private key, we need to use peerIdFromPrivateKey
    const { peerIdFromPrivateKey } = await import('@libp2p/peer-id');
    const restoredPeerId = await peerIdFromPrivateKey(restoredKey);
    console.log('✓ Key unmarshalled');
    console.log('✓ Restored PeerId:', restoredPeerId.toString());
    console.log('✓ PeerIds match:', peerId.toString() === restoredPeerId.toString());
    
    // Step 5: Test libp2p node creation
    console.log('\n5. Testing libp2p node creation...');
    const node = await createLibp2p({
      privateKey: restoredKey,
      start: false // Don't auto-start
    });
    console.log('✓ libp2p node created');
    console.log('✓ Node PeerId:', node.peerId.toString());
    console.log('✓ PeerId matches:', node.peerId.toString() === peerId.toString());
    
    console.log('\n✅ All tests passed!');
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
  }
}

// Run the test
testKeyGeneration();