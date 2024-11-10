const crypto = require( 'crypto');

// Function to generate a random JWT secret key
const generateJWTSecretKey = () => {
    // Generate a random 256-bit (32-byte) secret key
    return crypto.randomBytes(32).toString('hex');
};

// Example usage: generate a secret key and log it
const secretKey = generateJWTSecretKey();
console.log('Generated JWT Secret Key:', secretKey);
