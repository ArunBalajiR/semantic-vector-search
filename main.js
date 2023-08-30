const textract = require("textract");
const util = require("util");
const axios = require("axios");
const { MongoClient } = require("mongodb");
var ObjectId = require("mongodb").ObjectId;
const readline = require("readline");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function createEmbeddings() {
  const uri =
    "mongodb+srv://hanapedia-prd-suser:Rb4ERw1ox569dP5g@hanapedia-dev.nroda.mongodb.net";
  const client = new MongoClient(uri);
  await client.connect();
  const database = client.db("Hanapedia");
  const collection = database.collection("hnp_knowledgebase");
  const text = await extractFileContent();
  var chunks = createChunks(text, 500);
  for (var chunk of chunks) {
    var embeddingOfChunk = await generateEmbedding(chunk);
    await sleep(20000);
    var insertStatus = await collection.insertOne({
      content: chunk,
      embedding: embeddingOfChunk,
    });
    if (insertStatus.acknowledged) {
      console.log("Insertion was successful.");
    } else {
      console.log("Insertion failed.");
    }
  }
}

async function main() {
  const uri =
    "mongodb+srv://hanapedia-prd-suser:Rb4ERw1ox569dP5g@hanapedia-dev.nroda.mongodb.net";
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const database = client.db("Hanapedia");
    const collection = database.collection("hnp_knowledgebase");
    // await createEmbeddings();
    rl.question("Enter Search Query: ", async (input) => {
      console.log(`Thinking....: ${input}`);
      var query = input;
      const embedding = await generateEmbedding(query);
      const documents = await collection
        .aggregate([
          {
            $search: {
              index: "embedding",
              knnBeta: {
                vector: embedding,
                path: "embedding",
                k: 5,
              },
            },
          },
        ])
        .toArray();

      let fullContent;
      for (var document of documents) {
        fullContent += document.content;
      }
      askAI(fullContent, query);
      rl.close();
    });

    // console.log(text);
  } catch (error) {
    console.error("Error:", error);
  }
}

async function askAI(context, question) {
  const url = "https://api.openai.com/v1/engines/text-davinci-003/completions";
  const openai_key = "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";
  const client = axios.create({
    headers: { Authorization: "Bearer " + openai_key },
  });

  var system_prompt = `Answer the question based on the context below, and if the question can't be answered based on 
    the context, say I don't know \n\nContext: ${context}\n\n---\n\nQuestion: ${question}\nAnswer:`;
  console.log("\n\n\n=================ANSWER=========================");

  const params = {
    prompt: system_prompt,
    max_tokens: 200,
  };
  let answer;
  client
    .post(url, params)
    .then((result) => {
      console.log(params.prompt + result.data.choices[0].text);
      answer = result.data.choices[0].text;
      console.log("Answer: " + answer);
    })
    .catch((err) => {
      console.log(err);
    });
}

// split the given text to chunks
function createChunks(inputText, chunksize) {
  const chunks = [];
  let i = 0;
  while (i < inputText.length) {
    chunks.push(inputText.slice(i, i + chunksize));
    i += chunksize;
  }
  return chunks;
}

async function extractFileContent() {
  return new Promise((resolve, reject) => {
    textract.fromFileWithPath("./bitcoin.pdf", function (error, text) {
      if (error) {
        reject(error);
      } else {
        resolve(text);
      }
    });
  });
}

async function generateEmbedding(content) {
  const url = "https://api.openai.com/v1/embeddings";
  const openai_key = "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";
  try {
    const response = await axios.post(
      url,
      {
        input: content,
        model: "text-embedding-ada-002",
      },
      {
        headers: {
          Authorization: `Bearer ${openai_key}`,
          "Content-Type": "application/json",
        },
      }
    );

    let responseData;
    if (response.status === 200) {
      console.log("Successfully received embedding.");
      responseData = response.data;
    } else {
      console.log(
        `Failed to receive embedding. Status code: ${response.status}`
      );
    }
    // console.log(
    //   "Generated Embedding Data : " +
    //     JSON.stringify(responseData.data[0].embedding)
    // );
    return responseData.data[0].embedding;
  } catch (err) {
    console.error(err);
  }
}

main();
