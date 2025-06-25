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
      try {
        const count = await env.TOTAL_COUNT.get("TOTAL_COUNT");
        return count ? parseInt(count, 10) : 0;
      } catch (error) {
        console.error("Error getting total count from KV:", error);
        return 0;
      }
    }

    // Helper function to increment total count in KV
    async function incrementTotalCount() {
      try {
        const currentCount = await getTotalCount();
        const newCount = currentCount + 1;
        await env.TOTAL_COUNT.put("TOTAL_COUNT", newCount.toString());
        return newCount;
      } catch (error) {
        console.error("Error incrementing total count in KV:", error);
        return 0;
      }
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

    // Helper function to create stats blocks
    function createStatsBlocks(userName, totalShared, totalQuotes) {
      return [
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
                "*Total Rayfirmations Shared:*\n" +
                totalShared.toLocaleString(),
            },
            {
              type: "mrkdwn",
              text: "*Available Quotes:*\n" + totalQuotes.toLocaleString(),
            },
          ],
        },
        {
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: `Requested by @${userName}`,
            },
          ],
        },
      ];
    }

    // Helper function to create new quote modal
    function createNewQuoteModal(triggerId) {
      return {
        trigger_id: triggerId,
        view: {
          type: "modal",
          title: {
            type: "plain_text",
            text: "Add New Rayfirmation",
            emoji: true,
          },
          submit: {
            type: "plain_text",
            text: "Add Quote",
            emoji: true,
          },
          close: {
            type: "plain_text",
            text: "Cancel",
            emoji: true,
          },
          blocks: [
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: "Share a new inspirational quote from Ray to add to the collection! ✨",
              },
            },
            {
              type: "input",
              block_id: "quote_input",
              element: {
                type: "plain_text_input",
                action_id: "quote_text",
                placeholder: {
                  type: "plain_text",
                  text: "Enter your rayfirmation here...",
                },
                multiline: true,
                max_length: 500,
              },
              label: {
                type: "plain_text",
                text: "Rayfirmation",
                emoji: true,
              },
            },
          ],
        },
      };
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

            // Increment the total count
            const newTotalCount = await incrementTotalCount();

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

          const cleanedQuote = newQuote.replace(/["'“”‘’]/g, "").trim();
          console.log("Original newQuote:", newQuote);
          console.log("Cleaned quote (removing quotes):", cleanedQuote);
          console.log("Storing quote in database:", cleanedQuote);
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
          const totalShared = await getTotalCount();
          const totalQuotes = await getRayfirmationsCount();

          return Response.json({
            response_type: "ephemeral",
            text: `📊:rayfirmation: Rayfirmations Statistics\nTotal Shared: ${totalShared.toLocaleString()}\nAvailable Quotes: ${totalQuotes.toLocaleString()}`,
            blocks: createStatsBlocks(userName, totalShared, totalQuotes),
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
