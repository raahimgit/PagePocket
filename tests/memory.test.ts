import { MemoryRepository } from "./memory-repository";
import { repositoryContract } from "./repository.contract";

repositoryContract("memory", () => new MemoryRepository());
