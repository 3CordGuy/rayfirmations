/**
 * Enhanced Rayfirmation Slack Bot - Cloudflare Worker
 * Responds to /rayfirmation slash command with inspirational quotes from Ray
 */

export default {
  async fetch(request, env, ctx) {
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.includes("application/x-www-form-urlencoded")) {
      return new Response("Invalid request format", { status: 400 });
    }

    // Helper function to get total count from KV
    async function getTotalCount() {
      return await getTotalRayfirmShares();
    }

    // Helper function to get total count of rayfirmations from D1
    async function getRayfirmationsCount() {
      try {
        const result = await env.RAYDB.prepare(
          "SELECT COUNT(*) as count FROM quotes"
        ).first();
        return result ? result.count : 0;
      } catch (error) {
        console.error("Error getting rayfirmations count from D1:", error);
        return 0;
      }
    }

    // Helper function to get a random rayfirmation from D1
    async function getRandomRayfirmation() {
      try {
        const result = await env.RAYDB.prepare(
          "SELECT text FROM quotes ORDER BY RANDOM() LIMIT 1"
        ).first();
        return result ? result.text : "You are awesome!";
      } catch (error) {
        console.error("Error getting random rayfirmation from D1:", error);
        return "You are awesome!";
      }
    }

    // Helper function to get last N quotes with contributor
    async function getLastQuotesWithContributors(limit = 5) {
      try {
        const results = await env.RAYDB.prepare(
          `SELECT text, added_by_id, added_at FROM quotes ORDER BY added_at DESC LIMIT ?`
        )
          .bind(limit)
          .all();
        return results.results || [];
      } catch (error) {
        console.error("Error getting last quotes from D1:", error);
        return [];
      }
    }

    // Helper function to log a rayfirm share
    async function logRayfirmShare(userId) {
      try {
        await env.RAYDB.prepare(
          "INSERT INTO command_log (user_id, created_at) VALUES (?, datetime('now', 'utc'))"
        )
          .bind(userId)
          .run();
      } catch (error) {
        console.error("Error logging rayfirm share:", error);
      }
    }

    // Helper function to get total rayfirm shares from command_log
    async function getTotalRayfirmShares() {
      try {
        const result = await env.RAYDB.prepare(
          "SELECT COUNT(*) as count FROM command_log"
        ).first();
        return result ? result.count : 0;
      } catch (error) {
        console.error(
          "Error getting total rayfirm shares from command_log:",
          error
        );
        return 0;
      }
    }

    // Helper function to get top 3 Rayfirmers
    async function getTopRayfirmers(limit = 3) {
      try {
        const results = await env.RAYDB.prepare(
          `SELECT user_id, COUNT(*) as count FROM command_log GROUP BY user_id ORDER BY count DESC LIMIT ?`
        )
          .bind(limit)
          .all();
        return results.results || [];
      } catch (error) {
        console.error("Error getting top Rayfirmers from command_log:", error);
        return [];
      }
    }

    // Helper function to create stats blocks
    function createStatsBlocks(
      userName,
      totalShared,
      totalQuotes,
      lastQuotes = [],
      topRayfirmers = []
    ) {
      const blocks = [
        {
          type: "header",
          text: {
            type: "plain_text",
            text: "📊 Rayfirmations Statistics",
            emoji: true,
          },
        },
        {
          type: "section",
          fields: [
            {
              type: "mrkdwn",
              text:
                "*Total Rayfirmations Shared:* :chart_with_upwards_trend:\n`" +
                totalShared.toLocaleString() +
                "`",
            },
            {
              type: "mrkdwn",
              text:
                "*Available Quotes:* :rayfirmation:\n`" +
                totalQuotes.toLocaleString() +
                "`",
            },
          ],
        },
      ];

      if (topRayfirmers.length) {
        blocks.push({
          type: "section",
          text: {
            type: "mrkdwn",
            text:
              `*Top 3 Rayfirmers: :trophy:*
` +
              topRayfirmers
                .map(
                  (u, i) =>
                    `${i + 1}. <@${u.user_id}> — ${u.count} encouragements`
                )
                .join("\n"),
          },
        });
      }

      if (lastQuotes.length) {
        blocks.push({
          type: "divider",
        });
        blocks.push({
          type: "section",
          text: {
            type: "mrkdwn",
            text: "*Last 5 Added Rayfirmations:* :new:",
          },
        });
        lastQuotes.forEach((q, i) => {
          blocks.push({
            type: "section",
            text: {
              type: "mrkdwn",
              text: `${i + 1}. _${q.text}_  —  recorded by ${
                q.added_by_id === "system" ? "system" : `<@${q.added_by_id}>`
              }`,
            },
          });
        });
      }

      // Add instructions block
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: ':bulb: *To add a new rayfirmation, use:* `/rayfirmation add "Ray quote here"`',
        },
      });

      blocks.push({
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `Requested by @${userName}`,
          },
        ],
      });
      return blocks;
    }

    // Helper function to add new quote to database
    async function addNewQuote(quoteText, addedByUserId) {
      try {
        const result = await env.RAYDB.prepare(
          "INSERT INTO quotes (text, added_by_id, added_at) VALUES (?, ?, datetime('now', 'utc'))"
        )
          .bind(quoteText, addedByUserId)
          .run();
        return result.success;
      } catch (error) {
        console.error("Error adding new quote to D1:", error);
        return false;
      }
    }

    // Helper function to create rayfirmation blocks
    function createRayfirmationBlocks(rayfirmation, userName, totalCount) {
      return [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `✨ ${rayfirmation}`,
          },
        },
        {
          type: "actions",
          elements: [
            {
              type: "button",
              text: {
                type: "plain_text",
                text: "🎲 Shuffle",
                emoji: true,
              },
              value: "shuffle",
              action_id: "shuffle_rayfirmation",
            },
            {
              type: "button",
              text: {
                type: "plain_text",
                text: "💫 Rayfirm",
                emoji: true,
              },
              value: rayfirmation,
              action_id: "rayfirm_share",
              style: "primary",
            },
          ],
        },
        {
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: `Requested by @${userName} • Total rayfirmations shared: ${totalCount}`,
            },
          ],
        },
      ];
    }

    try {
      const formData = await request.formData();
      const payload = formData.get("payload");

      if (payload) {
        const interactionData = JSON.parse(payload);
        console.log(
          "interactionData",
          JSON.stringify(interactionData, null, 2)
        );

        // Handle Slack URL verification (rare for interactions, but just in case)
        if (interactionData.type === "url_verification") {
          return new Response(interactionData.challenge, {
            headers: { "Content-Type": "text/plain" },
          });
        }

        // Handle interactive messages (button clicks)
        if (
          interactionData.type === "interactive_message" ||
          interactionData.type === "block_actions"
        ) {
          const action = interactionData.actions[0];
          const userName = interactionData.user.name;

          if (action.action_id === "shuffle_rayfirmation") {
            console.log("IS SHUFFLING");
            const newRayfirmation = await getRandomRayfirmation();
            const totalCount = await getTotalCount();

            // 2. Then, asynchronously POST to the response_url
            await fetch(interactionData.response_url, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                replace_original: true,
                text: "🎲 Shuffled! Here is a new rayfirmation.",
                blocks: createRayfirmationBlocks(
                  newRayfirmation,
                  userName,
                  totalCount
                ),
              }),
            });
          }

          if (action.action_id === "rayfirm_share") {
            console.log(
              "IS SHARING: response_url",
              interactionData.response_url
            );
            // Share the current rayfirmation with everyone
            const currentRayfirmation = action.value;

            // Log the share in command_log
            await logRayfirmShare(interactionData.user.id);

            // Use the response_url to post in-channel
            await fetch(interactionData.response_url, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                delete_original: true,
                response_type: "in_channel",
                text: `${userName} rayfirms: "${currentRayfirmation}"`,
                blocks: [
                  {
                    type: "section",
                    text: {
                      type: "mrkdwn",
                      text: `_${currentRayfirmation}_`,
                    },
                  },
                  {
                    type: "context",
                    elements: [
                      {
                        type: "mrkdwn",
                        text: `Rayfirmed by <@${interactionData.user.id}>`,
                      },
                    ],
                  },
                ],
              }),
            });
          }
        }
        console.log("IS INTERACTION");
        // Return 200 OK for any unhandled interactions
        return new Response("OK", { status: 200 });
      } else if (formData.has("command")) {
        console.log("command", JSON.stringify(formData, null, 2));
        console.log("IS INITIAL COMMAND REQUEST");
        // Slash command
        const userName = formData.get("user_name") || "teammate";
        const userId = formData.get("user_id") || "unknown";
        const text = formData.get("text") || "";

        // Handle Slack's URL verification challenge (only needed during setup)
        const challenge = formData.get("challenge");
        if (challenge) {
          return new Response(challenge, {
            headers: { "Content-Type": "text/plain" },
          });
        }

        // Check if user wants to add a new quote
        if (text.trim().toLowerCase() === "new") {
          return Response.json({
            response_type: "ephemeral",
            text: '🤖 To add a new rayfirmation, please use the format:\n`/rayfirmation add "Your new quote here"`\n\nExample: `/rayfirmation add "You are absolutely amazing!"`',
          });
        }

        // Check if user wants to add a new quote with the quote
        if (text.trim().toLowerCase().startsWith("add ")) {
          console.log("text", text);

          // More flexible quote parsing - handle different quote formats
          const addText = text.substring(4).trim(); // Remove "add " prefix
          console.log("addText", addText);

          let newQuote = "";

          // Try to extract quote from various formats
          if (addText.startsWith('"') && addText.endsWith('"')) {
            // Format: add "quote"
            newQuote = addText.slice(1, -1);
          } else if (addText.startsWith("'") && addText.endsWith("'")) {
            // Format: add 'quote'
            newQuote = addText.slice(1, -1);
          } else if (addText.includes('"')) {
            // Format: add "quote with spaces
            const firstQuote = addText.indexOf('"');
            const lastQuote = addText.lastIndexOf('"');
            if (firstQuote !== lastQuote) {
              newQuote = addText.substring(firstQuote + 1, lastQuote);
            }
          } else {
            // No quotes found, treat the whole text as the quote
            newQuote = addText;
          }

          // If extraction failed or resulted in empty string, use the whole addText
          if (!newQuote || newQuote.trim().length === 0) {
            newQuote = addText;
          }

          console.log("newQuote", newQuote);

          if (newQuote.length > 500) {
            return Response.json({
              response_type: "ephemeral",
              text: "🤖 Quote is too long. Please keep it under 500 characters.",
            });
          }

          const cleanedQuote = newQuote.replace(/["'""']/g, "").trim();

          const success = await addNewQuote(cleanedQuote, userId);

          if (success) {
            return Response.json({
              response_type: "ephemeral",
              text: `✅ Successfully added new rayfirmation!\n\n>${newQuote}\n\n:rayfirmation:Thank you for contributing to the collection! ✨`,
              emoji: true,
            });
          } else {
            return Response.json({
              response_type: "ephemeral",
              text: "❌ Failed to add the quote. It might already exist in the database, or there was an error. Please try again.",
            });
          }
        }

        // Check if user wants stats
        if (text.trim().toLowerCase() === "stats") {
          const totalShared = await getTotalRayfirmShares();
          const totalQuotes = await getRayfirmationsCount();
          const lastQuotes = await getLastQuotesWithContributors(5);
          const topRayfirmers = await getTopRayfirmers(3);

          return Response.json({
            response_type: "ephemeral",
            text: `📊 Rayfirmations Statistics\nTotal Shared: ${totalShared.toLocaleString()}\nAvailable Quotes: ${totalQuotes.toLocaleString()}`,
            blocks: createStatsBlocks(
              userName,
              totalShared,
              totalQuotes,
              lastQuotes,
              topRayfirmers
            ),
            emoji: true,
          });
        }

        // Get a random rayfirmation from D1
        const randomRayfirmation = await getRandomRayfirmation();

        // Get current total count
        const totalCount = await getTotalCount();

        return Response.json({
          response_type: "ephemeral", // Private message with buttons
          text: randomRayfirmation,
          blocks: createRayfirmationBlocks(
            randomRayfirmation,
            userName,
            totalCount
          ),
        });
      } else {
        // Unknown POST
        return new Response("Unrecognized Slack request", { status: 400 });
      }
    } catch (error) {
      console.error("Error processing rayfirmation request:", error);

      return Response.json({
        response_type: "ephemeral", // Only visible to the user who ran the command
        text: "🤖 Oops! Something went wrong getting your rayfirmation. Ray would say 'We're gonna get through this!' 💪",
      });
    }
  },
};
