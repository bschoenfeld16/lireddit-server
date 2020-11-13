import {Arg, Ctx, Field, InputType, Mutation, ObjectType, Query, Resolver} from "type-graphql";
import {MyContext} from "../types";
import {User} from "../entities/User";
import argon2 from "argon2"
import {COOKIE_NAME} from "../constants";
import {validateRegister} from "../utils/validateRegister";

@InputType()
export class UsernamePasswordInput {
    @Field()
    email: string;

    @Field()
    username: string;

    @Field()
    password: string;
}

@ObjectType()
class FieldError {
    @Field()
    field: string;

    @Field()
    message: string;
}

@ObjectType()
class UserResponse {
    @Field(() => [FieldError], {nullable: true})
    errors?: FieldError[];

    @Field(() => User, {nullable: true})
    user?: User;
}

@Resolver()
export class UserResolver {
    @Mutation(() => Boolean)
    async forgotPassword(
        @Arg("email") email: string,
        @Ctx() {req}: MyContext
    ) {
        // const user = await em.findOne(User, {})
        return true;
    }

    @Query(() => User, {nullable: true})
    async me(
        @Ctx() {em, req}: MyContext
    ) {
        if (!req.session.userId) {
            return null
        }

        return await em.findOne(User, {id: req.session.userId});
    }

    @Mutation(() => UserResponse)
    async register(
        @Arg("options") options: UsernamePasswordInput,
        @Ctx() {em, req}: MyContext
    ): Promise<UserResponse> {
        const errors = validateRegister(options);
        if (errors) {
            return {errors};
        }
        const hashedPassword = await argon2.hash(options.password);
        const user = em.create(User, {email: options.email, username: options.username, password: hashedPassword});
        try {
            await em.persistAndFlush(user);
        } catch (err) {
            if (err.code === "23505" /*|| err.detail.includes("already exists")*/) {
                // duplicate username error
                return {
                    errors: [{
                        field: "username",
                        message: "username already taken"
                    }]
                }

            }
        }

        req.session.userId = user.id;
        return {user}
    }

    @Mutation(() => UserResponse)
    async login(
        @Arg("usernameOrEmail") usernameOrEmail: string,
        @Arg("password") password: string,
        @Ctx() {em, req}: MyContext
    ): Promise<UserResponse> {
        const user = await em.findOne(User,
            usernameOrEmail.includes("@")
                ? {email: usernameOrEmail}
                : {username: usernameOrEmail});
        if (!user) {
            return {
                errors: [{
                    field: "usernameOrEmail",
                    message: "username or email doesn't exist"
                }]
            }
        }
        const valid = await argon2.verify(user.password, password);
        if (!valid) {
            return {
                errors: [{
                    field: "password",
                    message: "incorrect password"
                }]
            }

        }

        req.session.userId = user.id;

        return {user}
    }

    @Mutation(() => Boolean)
    logout(
        @Ctx() {req, res}: MyContext
    ) {
        return new Promise(resolve =>
            req.session.destroy(err => {
                res.clearCookie(COOKIE_NAME);
                if (err) {
                    console.log(err);
                    resolve(false);
                    return
                }
                resolve(true)
            }))
    }


}