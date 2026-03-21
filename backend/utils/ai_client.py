import openai
from config import Config

client = openai.OpenAI(
    base_url=Config.OPENAI_API_BASE,
    api_key=Config.OPENAI_API_KEY
)

def generate_embedding(text):
    """Generate generic vector embeddings using the configured embedding model."""
    try:
        response = client.embeddings.create(
            input=text,
            model=Config.EMBEDDINGS_MODEL_NAME
        )
        return response.data[0].embedding
    except Exception as e:
        print(f"Error generating embedding: {str(e)}")
        return None

def generate_summary(text, complexity=5, custom_prompt=None):
    """Generate a summary based on the complexity level (1-10) or a custom prompt."""
    format_rules = "Format your output entirely in rich, semantic Markdown. Use H1/H2/H3 headers, readable paragraphs, bolding (**text**), bullet points, tables where appropriate, and expressive emojis to make the summary look highly realistic, premium, and aesthetically pleasing. Strip all conversational filler and output ONLY the processed markdown text."
    
    if custom_prompt:
        instruction = f"Strictly follow these extraction instructions:\n{custom_prompt}\n\n{format_rules}"
    elif complexity <= 4:
        instruction = f"Provide a concise, high-yield summary of the key points in the text.\n\n{format_rules}"
    elif complexity <= 7:
        instruction = f"Provide a well-structured, balanced summary of the text. Highlight the main ideas, core arguments, and important details.\n\n{format_rules}"
    else:
        instruction = f"""Create an in-depth, highly structured summary of this text segment. For this segment, provide:
1. A concise yet comprehensive summary capturing the essence of the content.
2. A breakdown of the core principles, theories, philosophies, or methodologies introduced.
3. Key takeaways and conceptual frameworks explained in clear, understandable language.
4. Practical applications of the ideas and how they can be implemented in real-world scenarios.
5. Direct quotes (brief and potent) from the text where they help illuminate a concept or principle.

Ensure that the summary conveys a deep understanding of the material as if the reader had studied the book closely.\n\n{format_rules}"""
        
    try:
        response = client.chat.completions.create(
            model=Config.LLM_MODEL_NAME,
            messages=[
                {"role": "system", "content": instruction},
                {"role": "user", "content": text}
            ],
            temperature=0.0,
            seed=42
        )
        return response.choices[0].message.content
    except Exception as e:
        print(f"Error generating summary: {str(e)}")
        return None

def analyze_image(base64_image, prompt="Extract all the visible text from this page and provide a comprehensive structured summary of the content. Format the summary entirely in rich, semantic Markdown using H1/H2/H3 headers, readable paragraphs, bullet points, bolding (**text**), appropriate tables, and expressive emojis to make it highly realistic, premium, and aesthetically robust. Output ONLY the extracted text and the summary. Do NOT include any conversational filler, greetings, or introductory phrases."):
    """Analyze an image using the vision model."""
    try:
        response = client.chat.completions.create(
            model=Config.VISION_MODEL_NAME,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/jpeg;base64,{base64_image}"
                            }
                        }
                    ]
                }
            ],
            temperature=0.0,
            seed=42
        )
        return response.choices[0].message.content
    except Exception as e:
        print(f"Error analyzing image: {str(e)}")
        return None

def ask_question(context, question, message_history=None):
    """Answer a question based on retrieved context (RAG)."""
    if message_history is None:
        message_history = []
    try:
        sys_prompt = {"role": "system", "content": f"You are an AI learning companion named Po! Answer the question using the provided context.\nIf the context does not contain the answer, say so.\n\nContext:\n{context}"}
        
        messages = [sys_prompt]
        messages.extend(message_history)
        messages.append({"role": "user", "content": question})
        
        response = client.chat.completions.create(
            model=Config.LLM_MODEL_NAME,
            messages=messages,
            temperature=0.0,
            seed=42
        )
        return response.choices[0].message.content
    except Exception as e:
        print(f"Error asking question: {str(e)}")
        return None
