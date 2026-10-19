export interface IngestionSecretHash {
  keyHash: string;
  keySalt: string;
}

export interface CreatedIngestionKey extends IngestionSecretHash {
  id: string;
  rawKey: string;
  keyPrefix: string;
}
