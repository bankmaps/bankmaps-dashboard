from openai import OpenAI

# Ask for API key interactively
api_key = input("Enter your OpenAI API key: ").strip()
client = OpenAI(api_key=api_key)

print("\n✅ Chat ready! Type 'exit' to quit.\n")

while True:
    user_input = input("You: ")
    if user_input.lower() in ("exit", "quit"):
        break

    response = client.chat.completions.create(
        model="gpt-4o-mini",   # fast, low-cost model
        messages=[{"role": "user", "content": user_input}]
    )
    answer = response.choices[0].message.content
    print("AI: " + answer + "\n")
