import {EntityManager} from "@mikro-orm/core";
import {Request, Response} from "express";
import {Redis} from "ioredis";

export type MyContext = {
    em: EntityManager;
    req: Request & { session: { userId?: number } };
    res: Response;
    redis: Redis
}