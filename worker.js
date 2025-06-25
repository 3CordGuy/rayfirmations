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

    const rayfirmations = [
      "Wow! Everything you do turns to gold!✨",
      "Wow! You are looking awesome today.",
      "This is the best company in the world. And it is made better by you being here!",
      "I'm glad you work here.",
      "Gosh, I love this place!",
      "You are loved, just as you are.❤️",
      "You make this place better.",
      "Your presence in this company is a source of joy and inspiration.",
      "You rock. You're just amazing.",
      "I respect you!",
      "TeamGantt is amazing. And that's because of you.",
      "I work with the greatest team in the world.",
      "Thank you for being a part of TeamGantt!",
      "I'm glad you could join me today!",
      "God bless you.",
      "Man, this day is awesome! You are awesome.",
      "Everyone here is so amazing. 🤩",
      "You are doing amazing things here at TeamGantt!",
      "You guys are awesome. I just can't believe the amazing work everyone does!",
      "You guys are knocking it out of the park!",
      "I love working with you and all of the amazing Team at TeamGantt!",
      "Everyone is pitching in big time!",
      "Jason's beard is just great! Magical!",
      "This is just awesome. You are all awesome.",
      "Thanks for all the hard work!",
      "You guys just don't stop!",
      "This is still the best company to be at!",
      "Thank you thank you thank you!",
      "It doesn't happen without you guys!",
      "It doesn't happen without each and every one of you!",
      "Just keep it up!",
      "Keep working hard!",
      "Everyone is just workin' smart!",
      "I'm surrounded by geniuses.",
      "Keep working it.",
      "This is the best company to be at.",
      "This doesn't happen without you guys, Period. It just doesn't.",
      "I feel like I'm a broken record but it keeps getting better and better.",
      "Awesome work, everyone!",
      "Good morning, great souls!",
      "You are the whole package. From humble to genius. :100:",
      "We would be lost without you!",
      "What a bunch of smart people!",
      "You don't crash the party... You make the party better!",
      "Everything you do is fun and interesting!",
      "It's not possible to put you down. There's no material. There's nothing there.",
      "Gantt has always been great, but it's getting even greater.",
      "It's mindblowing!",
      "I'm sure our customers are going to be blown away.",
      "I love working at this company because of you guys.",
      "We would be lost without your genius. You make everything greater.",
      "I do not deserve to be surrounded by such talented human beings.",
      "Each of you light up my day and make me want to do the best I can do, which is a fraction of what each of you do every day.",
      "You are the smartest and most genuine people in the room.",
      "WOW! You people rock!",
      "Everything everyone here does is extremely important!!!!",
      "Thank you Lord for allowing me to be surrounded by the greatest minds.",
      "This is the greatest job in the world. It doesn't even feel like work. It feels like we're out surfing.",
      "It's great to be surrounded by smarter minds.",
      "I marked everyone as VIP... Because you are all VIP.",
      "I am confident because of you guys!",
      "We're gonna get through this!",
      "We are going to keep reaching down into our souls…",
      "You are all A++++",
      "Keep it up. You are awesome!",
      "You are like a smart swiss army knife. You have a solution for everything. Innovation at its best!",
      "Have I told you 'I love you lately?'",
      "I love all you professors. You make my life better.",
      "You're an angel.",
      "TeamGantt is a vacation!",
      "Life is better when I am surrounded by all of you.",
      "And thank you guys for making it so easy and fun to work here. Actually, it is just all fun and no work.",
      "Let's get it over the fence!",
      "Keep it going, baby!",
    ];

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
            const newRayfirmation =
              rayfirmations[Math.floor(Math.random() * rayfirmations.length)];
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
                      text: `> "${currentRayfirmation}"`,
                    },
                  },
                  {
                    type: "context",
                    elements: [
                      {
                        type: "mrkdwn",
                        text: `Rayfirmed by <@${interactionData.user.id}> • Total rayfirmations shared: ${newTotalCount}`,
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

        // Get a random rayfirmation
        const randomRayfirmation =
          rayfirmations[Math.floor(Math.random() * rayfirmations.length)];

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
