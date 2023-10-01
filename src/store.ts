import 'reflect-metadata';
import { JSONArray, JSONObject, JSONPrimitive } from "./json-types";

export type Permission = "r" | "w" | "rw" | "none";

export type StoreResult = Store | JSONPrimitive | undefined;

export type StoreValue =
  | JSONObject
  | JSONArray
  | StoreResult
  | (() => StoreResult);

export interface IStore {
  defaultPolicy: Permission;
  allowedToRead(key: string): boolean;
  allowedToWrite(key: string): boolean;
  read(path: string): StoreResult;
  write(path: string, value: StoreValue): StoreValue;
  writeEntries(entries: JSONObject): void;
  entries(): JSONObject;
}

export function Restrict(...params: unknown[]): any {
  const access = params?.[0];
  return function(target: any, key: string) {
    Reflect.defineMetadata('access', access, target, key);
  }
}

export class Store implements IStore {
  defaultPolicy: Permission = "rw";
  [key: string]: any;

  allowedToRead(key: string): boolean {
    const metadata = Reflect.getMetadata("access", this, key);
    if (!metadata) {
      return this.defaultPolicy.includes('r');
    }
    else if (metadata.includes('r')) {
      return true;
    }
    return false;
  }

  allowedToWrite(key: string): boolean {
    const metadata = Reflect.getMetadata("access", this, key);
    if (!metadata) {
      return this.defaultPolicy.includes('w');
    }
    else if (metadata.includes('w')) {
      return true;
    }
    return false;
  }

  read(path: string): StoreResult {
    const keys = path.split(':');
    const key = keys[0];
    if (!keys.length) {
      return;
    }
    else if (keys.length === 1) {
      if (this.allowedToRead(key)) {
        return typeof this[key] === 'function' ? this[key]() : this[key];
      }
      this.restrictKeyAccess(key);
    }
    else {
      if (this.allowedToRead(key)) {
        const newPath = keys.slice(1).join(':');
        if (this[key] instanceof Store) {
          return this[key].read(newPath);
        }
        else if (typeof this[key] === 'function' && (this[key]() instanceof Store)) {
          return this[key]().read(newPath);
        }
        return;
      }
      this.restrictKeyAccess(key);
    }
  }

  restrictKeyAccess(key: string): void {
    throw new Error(`${key} is not readable`);
  }

  write(path: string, value: StoreValue): StoreValue {
    const keys = path.split(':');
    const key = keys[0];
    if (keys.length === 1) {
      this.setKeyValue(key, this.convertToStore(value));
    }
    else if (keys.length > 1) {
      if (!this.hasOwnProperty(key)) {
        this.setKeyValue(key, new Store());
      }
      if (this[key] instanceof Store) {
        const newPath = keys.slice(1).join(':');
        return this[key].write(newPath, value);
      }
    }
    return;
  }

  convertToStore(value: StoreValue): StoreValue {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const store = new Store();
      for (const [key, data] of Object.entries(value)) {
        store.write(key, data);
      }
      return store;
    }
    return value;
  }

  setKeyValue(key: string, value: StoreValue): void {
    if (this.allowedToWrite(key)) {
      this[key] = value;
    }
    else {
      throw new Error(`${key} is not writable`);
    }
  }

  writeEntries(entries: JSONObject): void {
    for (const key in entries) {
      this.write(key, entries[key]);
    }
  }

  entries(): JSONObject {
    let entriesObject: JSONObject= {};
    for (const key of Object.keys(this)) {
      if (this.allowedToRead(key)) {
        if (this[key] instanceof Store) {
          entriesObject[key]= this[key].entries();
        }
        else {
          entriesObject[key] = this[key];
        }
      }
    }
    return entriesObject;
  }
}