import csv
import sys
import os

CSV_FILE = "/tmp/past_logs.csv"
OUT_FILE = "past_logs.txt"
MAX_EXAMPLES_PER_CATEGORY = 3

def main():
    if not os.path.exists(CSV_FILE):
        print(f"Error: {CSV_FILE} not found.")
        sys.exit(1)

    # To group by contact_reason
    # Ensure we only pick ones with a valid reply_body
    examples = {}

    try:
        with open(CSV_FILE, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                reason = row.get('contact_reason', '').strip()
                message = row.get('message', '').strip()
                reply = row.get('reply_body', '').strip()

                if not reason or not message or not reply or reply == 'NULL':
                    continue
                
                # Exclude purely automated generic replies if desired, 
                # but for MS let's just take the first N good ones.
                if reason not in examples:
                    examples[reason] = []
                
                if len(examples[reason]) < MAX_EXAMPLES_PER_CATEGORY:
                    # To avoid duplicates or extremely short replies
                    if len(reply) > 20: 
                        examples[reason].append((message, reply))

    except Exception as e:
        print(f"Error reading CSV: {e}")
        sys.exit(1)

    # Write to text file formatted for AI
    try:
        with open(OUT_FILE, 'w', encoding='utf-8') as out:
            out.write("--- 過去の類似問い合わせ対応ログ（参考テンプレート） ---\n\n")
            for reason, items in examples.items():
                if not items:
                    continue
                
                for i, (msg, rep) in enumerate(items, 1):
                    out.write(f"【カテゴリ】：{reason}\n")
                    out.write(f"【お客様からのメッセージ】：\n{msg}\n")
                    out.write(f"【実際の返信文】：\n{rep}\n")
                    out.write("-" * 40 + "\n\n")

        print(f"Successfully generated {OUT_FILE} with compressed log data.")
    except Exception as e:
        print(f"Error writing to {OUT_FILE}: {e}")
        sys.exit(1)

if __name__ == '__main__':
    main()
