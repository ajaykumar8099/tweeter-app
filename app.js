const express = require("express");
const sqlite3 = require("sqlite3");
const { open } = require("sqlite");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const path = require("path");
const filePath = path.join(__dirname, "twitterClone.db");
const app = express();
app.use(express.json());
let db = null;
const callDb = async () => {
  try {
    db = await open({
      filename: filePath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server is Started");
    });
  } catch (e) {
    Console.log(`DB error ${e.message}`);
    process.exit(1);
  }
};
callDb();
app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const sql = `SELECT username FROM user WHERE username = '${username}';`;
  const dbRes = await db.get(sql);
  if (dbRes === undefined) {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const hashedPassword = await bcrypt.hash(password, 10);
      const insert = `INSERT INTO user(username,password,name,gender)
      VALUES('${username}','${hashedPassword}','${name}','${gender}');`;
      await db.get(insert);
      response.send("User created successfully");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const sql = `SELECT * FROM user WHERE username = '${username}';`;
  const dbRes = await db.get(sql);
  if (dbRes === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isMatch = await bcrypt.compare(password, dbRes.password);
    if (isMatch === true) {
      const payLoad = { username: username };
      const jwtObj = jwt.sign(payLoad, "myKey");
      response.send({ jwtObj });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});
const authentication = (request, response, next) => {
  let jwtToken;
  const authorHeader = request.headers["authorization"];
  if (authorHeader !== undefined) {
    jwtToken = authorHeader.split(" ")[1];
  } else {
    response.status(401);
    response.send("Invalid JWT Token");
  }

  if (jwtToken !== undefined) {
    jwt.verify(jwtToken, "myKey", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};
app.get("/user/tweets/feed/", authentication, async (request, response) => {
  let { username } = request;
  const sql = `SELECT user_id from user WHERE username= '${username}';`;
  const sqlDb = await db.get(sql);
  const followQuery = `SELECT following_user_id from follower
    WHERE follower_user_id = ${sqlDb.user_id};`;
  const followsId = await db.all(followQuery);
  const simple = followsId.map((each) => {
    return each.following_user_id;
  });
  const tweet = `SELECT user.username, tweet.tweet, tweet.date_time as dateTime
    from user INNER JOIN tweet on user.user_id = tweet.user_id WHERE user.user_id in (${simple})
    ORDER BY tweet.date_time DESC limit 4;`;
  const result = await db.all(tweet);
  response.send(result);
});
app.get("/user/following/", authentication, async (request, response) => {
  let { username } = request;
  const sql = `SELECT user_id from user WHERE username = '${username}';`;
  const userId = await db.get(sql);
  const sqlTwo = `SELECT following_user_id from follower 
    WHERE follower_user_id = ${userId.user_id};`;
  const followerArray = await db.all(sqlTwo);
  const followerId = followerArray.map((each) => {
    return each.following_user_id;
  });
  const sqlResult = `SELECT name from user WHERE user_id in (${followerId});`;
  const result = await db.all(sqlResult);
  response.send(result);
});
app.get("/user/followers/", authentication, async (request, response) => {
  let { username } = request;
  const sql = `SELECT user_id FROM user WHERE username = '${username}';`;
  const userId = await db.get(sql);
  const sqlTwo = `SELECT follower_user_id from follower where following_user_id = ${userId.user_id};`;
  const array = await db.all(sqlTwo);
  const foId = array.map((each) => {
    return each.following_user_id;
  });
  console.log(`${foId}`);
  const query = `SELECT name from user WHERE user_id in (${foId});`;
  const result = await db.all(query);
  response.send(result);
});
const apiOutput = (tweetData, likesCount, replyCount) => {
  return {
    tweet: tweetData.tweet,
    likes: likesCount.likes,
    replies: replyCount.replies,
    dateTime: tweetData.date_time,
  };
};
app.get("/tweets/:tweetId/", authentication, async (request, response) => {
  const { tweetId } = request.params;
  let { username } = request;
  const sql = `SELECT user_id FROM user WHERE username = '${username}';`;
  const userId = await db.get(sql);
  const sqlTwo = `SELECT following_user_id FROM  follower WHERE follower_user_id = ${userId.user_id}`;
  const array = await db.all(sqlTwo);
  const foId = array.map((each) => {
    return each.following_user_id;
  });
  const tQ = `SELECT tweet_id from tweet where user_id (${foId});`;
  const tA = await db.all(tQ);
  const tI = tA.map((each) => {
    return each.tweet_id;
  });
  if (tI.includes(parseInt(tweetId))) {
    const likes = `select count(user_id) as likes from like where tweet_id=${tweetId};`;
    const lC = await db.get(likes);

    const reply = `select count(user_id) as replies from reply where tweet_id=${tweetId};`;
    const rC = await db.get(reply);

    const tweetData = `select tweet,date_time from tweet where tweet_id=${tweetId};`;
    const tD = await db.get(tweetData);
    response.send(apiOutput(tD, lC, rC));
  } else {
    response.status(401);
    response.send("Invalid Request");
    console.log("Invalid Request");
  }
});
const convertLike = (dbObject) => {
  return {
    likes: dbObject,
  };
};
app.get(
  "/tweets/:tweetId/likes/",
  authentication,
  async (request, response) => {
    const { tweetId } = request.params;
    let { username } = request;
    const IdQuery = `SELECT user_id from user where username = '${username}';`;
    const userId = await db.get(IdQuery);
    const foQuery = `select following_user_id from follower where follower_user_id = ${userId.user_id};`;
    const array = await db.all(foQuery);
    const foId = array.map((each) => {
      return each.following_user_id;
    });
    const tweetQu = `select tweet_id from tweet where user_id in (${foId});`;
    const tweetArray = await db.all(tweetQu);
    const getTid = tweetArray.map((each) => {
      return each.tweet_id;
    });
    if (getTid.includes(parseInt(tweetId))) {
      const sqQu = `select user.username as likes from user inner join like
        on user.user_id = like.user_id where like.tweet_id = ${tweetId};`;
      const arr = await db.all(sqQu);
      const uln = arr.map((each) => {
        return each.likes;
      });
      response.send(convertLike(uln));
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);
const convertReply = (dbObject) => {
  return {
    replies: dbObject,
  };
};
app.get(
  "/tweets/:tweetId/replies/",
  authentication,
  async (request, response) => {
    const { tweetId } = request.params;
    let { username } = request;
    const IdQuery = `SELECT user_id from user where username = '${username}';`;
    const userId = await db.get(IdQuery);
    const foQuery = `select following_user_id from follower where follower_user_id = ${userId.user_id};`;
    const array = await db.all(foQuery);
    const foId = array.map((each) => {
      return each.following_user_id;
    });
    const tweetQu = `select tweet_id from tweet where user_id in (${foId});`;
    const tweetArray = await db.all(tweetQu);
    const getTid = tweetArray.map((each) => {
      return each.tweet_id;
    });
    if (getTid.includes(parseInt(tweetId))) {
      const sqQu = `select user.name,reply.reply  from user inner join reply
        on user.user_id = reply.user_id where reply.tweet_id = ${tweetId};`;
      const arr = await db.all(sqQu);
      const uln = arr.map((each) => {
        return each.likes;
      });
      response.send(convertReply(uln));
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);
app.get("/user/tweets/", authentication, async (request, response) => {
  let { username } = request;
  const IdQuery = `SELECT user_id from user where username = '${username}';`;
  const userId = await db.get(IdQuery);
  console.log(userId);
  const foQuery = `select tweet_id from tweet where user_id = ${userId.user_id};`;
  const array = await db.all(foQuery);
  response.send(
    array.map((each) => {
      return parseInt(each.tweet_id);
    })
  );
});
app.post("/user/tweets/", authentication, async (request, response) => {
  let { username } = request;
  const IdQuery = `SELECT user_id from user where username = '${username}';`;
  const userId = await db.get(IdQuery);
  const { tweet } = request.body;
  const cDate = new Date();
  const postQ = `insert into tweet(tweet,user_id,date_time)
    VALUES('${tweet}',${userId.user_id},'${cDate}');`;
  const result = await db.run(postQ);
  const tweet_id = result.lastId;
  response.send("Created a Tweet");
});
app.delete("/tweets/:tweetId/", authentication, async (request, response) => {
  let { username } = request;
  const IdQuery = `SELECT user_id from user where username = '${username}';`;
  const userId = await db.get(IdQuery);
  const { tweetId } = request.params;
  const tweetQu = `select tweet_id from tweet where user_id=${userId.user_id};`;
  const tweetArray = await db.all(tweetQu);
  const getTid = tweetArray.map((each) => {
    return each.tweet_id;
  });
  console.log(getTid);
  if (getTid.includes(parseInt(tweetId))) {
    const sqQu = `delete from tweet where tweet_id = ${tweetId};`;
    await db.run(sqQu);
    response.send("Tweet Removed");
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});
module.exports = app;
