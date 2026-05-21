const ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
const ID_RANDOM_LENGTH = 20;

function randomIndex(max: number) {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return values[0] % max;
}

function randomToken(length: number) {
  let token = '';

  for (let index = 0; index < length; index += 1) {
    token += ID_ALPHABET[randomIndex(ID_ALPHABET.length)];
  }

  return token;
}

export function createOpaqueInventoryId(prefix: 'sku' | 'service') {
  return `${prefix}-${randomToken(ID_RANDOM_LENGTH)}`;
}
