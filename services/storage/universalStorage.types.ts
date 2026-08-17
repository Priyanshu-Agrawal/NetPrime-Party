export interface UniversalStorage {
  getString: (key: string) => string | undefined;
  set: (key: string, value: string | boolean | number) => void;
  getBoolean: (key: string) => boolean | undefined;
  getNumber: (key: string) => number | undefined;
  remove: (key: string) => void;
  delete?: (key: string) => void;
  contains: (key: string) => boolean;
  clearAll: () => void;
}
