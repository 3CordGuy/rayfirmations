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

        // Handle Slack's URL verification challenge (only needed during setup)
        const challenge = formData.get("challenge");
        if (challenge) {
          return new Response(challenge, {
            headers: { "Content-Type": "text/plain" },
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
