import {EntityManager} from "@mikro-orm/core";
import {Request, Response} from "express";
import {SessionData} from "express-session";

declare module 'express-session' {
    interface SessionData {
        userId: number;
    }
}

export type MyContext = {
    em: EntityManager;
    req: Request & { session: SessionData };
    res: Response;
}