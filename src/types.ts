import {EntityManager} from "@mikro-orm/core";
import {Request, Response} from "express";

export type MyContext = {
    em: EntityManager;
    req: Request & { session: {userId?: number} };
    res: Response;
}