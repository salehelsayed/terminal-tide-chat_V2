// generate-private-key.js
import { generateKeyPair } from '@libp2p/crypto/keys'; 
import { peerIdFromPrivateKey } from '@libp2p/peer-id';

async function createAndExportPrivateKey() {
  try {
    const privateKeyObj = await generateKeyPair('Ed25519');

    // For Ed25519, privateKeyObj.raw is the 64-byte expanded private key
    // (32-byte seed + 32-byte public key).
    const rawEd25519PrivateKey64Bytes = privateKeyObj.raw;

    console.log(`Actual length of privateKeyObj.raw: ${rawEd25519PrivateKey64Bytes.length}`);

    if (rawEd25519PrivateKey64Bytes.length === 64) {
        console.log('\nGenerated Ed25519 Private Key (raw 64-byte format from privateKeyObj.raw):');
        console.log('Uint8Array.from([');
        let outputArrayString = '  ';
        for (let i = 0; i < rawEd25519PrivateKey64Bytes.length; i++) {
            outputArrayString += rawEd25519PrivateKey64Bytes[i];
            if (i < rawEd25519PrivateKey64Bytes.length - 1) {
                outputArrayString += ', ';
                if ((i + 1) % 12 === 0) { // Newline every 12 numbers for better readability
                    outputArrayString += '\n  ';
                }
            }
        }
        console.log(outputArrayString);
        console.log('])');
        console.log(`\nLength: ${rawEd25519PrivateKey64Bytes.length} bytes`);
    } else {
        console.warn(`Unexpected length for privateKeyObj.raw: ${rawEd25519PrivateKey64Bytes.length}. Expected 64 for Ed25519 expanded private key.`);
    }

    // Also, let's show the Peer ID for this key
    const peerId = peerIdFromPrivateKey(privateKeyObj);
    console.log('\nAssociated Peer ID:');
    console.log(peerId.toString());

  } catch (error) {
    console.error('Error generating private key:', error);
  }
}

createAndExportPrivateKey();