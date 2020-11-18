import {
    Arg,
    Ctx,
    Field,
    FieldResolver,
    InputType,
    Int,
    Mutation,
    ObjectType,
    Query,
    Resolver,
    Root,
    UseMiddleware,
} from "type-graphql";
import { Post } from "../entities/Post";
import { MyContext } from "../types";
import { isAuth } from "../middleware/isAuth";
import { getConnection } from "typeorm";
import { Updoot } from "../entities/Updoot";

@InputType()
class PostInput {
    @Field()
    title: string;

    @Field()
    text: string;
}

@ObjectType()
class PaginatedPosts {
    @Field(() => [Post])
    posts: Post[];

    @Field()
    hasMore: boolean;
}

@Resolver(Post)
export class PostResolver {
    @FieldResolver(() => String)
    textSnippet(@Root() root: Post) {
        return root.text.slice(0, 50);
    }

    @Mutation(() => Boolean)
    @UseMiddleware(isAuth)
    async vote(
        @Arg("postId", () => Int) postId: number,
        @Arg("value", () => Int) value: number,
        @Ctx() { req }: MyContext
    ) {
        const isUpdoot = value !== -1;
        const realValue = isUpdoot ? 1 : -1;
        const { userId } = req.session;
        await getConnection().transaction(async (transActionEntityManager) => {
            const updoot = await transActionEntityManager.findOne(Updoot, {
                where: { userId, postId },
            });

            if (updoot && updoot.value === realValue) {
                // do nothing
            } else {
                let pointChange = realValue;
                if (updoot && updoot.value !== realValue) {
                    await transActionEntityManager.update(
                        Updoot,
                        { userId, postId },
                        {
                            userId,
                            postId,
                            value: realValue,
                        }
                    );
                    pointChange = 2 * realValue;
                } else if (!updoot) {
                    await transActionEntityManager.insert(Updoot, {
                        userId,
                        postId,
                        value: realValue,
                    });
                }
                await transActionEntityManager
                    .createQueryBuilder()
                    .update(Post)
                    .set({ points: () => `points + ${pointChange}` })
                    .where("id = :id", { id: postId })
                    .execute();
            }
        });
        return true;
    }

    @Query(() => PaginatedPosts)
    async posts(
        @Arg("limit", () => Int) limit: number,
        @Arg("cursor", () => String, { nullable: true }) cursor: string,
        @Ctx() { req }: MyContext
    ): Promise<PaginatedPosts> {
        const realLimit = Math.min(50, limit);
        const reaLimitPlusOne = realLimit + 1;

        const replacements: any[] = [reaLimitPlusOne];

        if (req.session.userId) {
            replacements.push(req.session.userId);
        }

        let cursorIdx = 3;
        if (cursor) {
            replacements.push(new Date(parseInt(cursor)));
            cursorIdx = replacements.length;
        }

        const posts = await getConnection().query(
            `
                select p.*,
                json_build_object(
                  'id', u.id,
                  'username', u.username,
                  'email', u.email,
                  'createdAt', u."createdAt",
                  'updatedAt', u."updatedAt"
                  ) creator,
                ${
                    req.session.userId
                        ? '(select value from updoot where "userId" = $2 and "postId" = p.id) "voteStatus"'
                        : 'null as "voteStatus"'
                }
                from post p
                inner join public.user u on u.id = p."creatorId"
                ${cursor ? `where p."createdAt" < $${cursorIdx}` : ""}
                order by p."createdAt" DESC
                limit $1
            `,
            replacements
        );

        // const qb = getConnection()
        //   .getRepository(Post)
        //   .createQueryBuilder("p")
        //   .innerJoinAndSelect("p.creator", "u", 'u.id = p."creatorId"')
        //   .orderBy('p."createdAt"', "DESC")
        //   .take(reaLimitPlusOne);

        // if (cursor) {
        //   qb.where('p."createdAt" < :cursor', {
        //     cursor: new Date(parseInt(cursor)),
        //   });
        // }

        // const posts = await qb.getMany();
        // console.log("posts: ", posts);

        return {
            posts: posts.slice(0, realLimit),
            hasMore: posts.length === reaLimitPlusOne,
        };
    }

    @Query(() => Post, { nullable: true })
    post(@Arg("id", () => Int) id: number): Promise<Post | undefined> {
        return Post.findOne(id, { relations: ["creator"] });
    }

    @Mutation(() => Post)
    @UseMiddleware(isAuth)
    async createPost(
        @Arg("input") input: PostInput,
        @Ctx() { req }: MyContext
    ): Promise<Post> {
        return Post.create({
            ...input,
            creatorId: req.session.userId,
        }).save();
    }

    @Mutation(() => Post, { nullable: true })
    async updatePost(
        @Arg("id") id: number,
        @Arg("title", () => String, { nullable: true }) title: string
    ): Promise<Post | null> {
        const post = await Post.findOne(id);
        if (!post) {
            return null;
        }

        if (typeof title !== "undefined") {
            post.title = title;
            await Post.update(id, { title });
        }
        return post;
    }

    @Mutation(() => Boolean)
    @UseMiddleware(isAuth)
    async deletePost(
        @Arg("id", () => Int) id: number,
        @Ctx() { req }: MyContext
    ): Promise<Boolean> {
        const post = await Post.findOne(id);
        if (!post) {
            return false;
        }
        if (post.creatorId !== req.session.userId) {
            throw new Error("not authorized");
        }

        // non cascading
        await Updoot.delete({ postId: id });
        await Post.delete({ id });

        // cascading
        // await Post.delete({ id, creatorId: req.session.userId });
        return true;
    }
}
