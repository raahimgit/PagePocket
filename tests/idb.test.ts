import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { IdbRepository } from "../src/storage/idb";
import { idbSpecific } from "./idb-specific";
import { repositoryContract } from "./repository.contract";

repositoryContract("indexeddb", () => new IdbRepository("test", new IDBFactory()));

let n = 0;
idbSpecific("fake-indexeddb", () => new IDBFactory(), () => `db${n++}`);
