import csv
import sys

def convert_csv_to_text(input_file, output_file):
    faq_lines = []
    faq_lines.append("--- お弁当デリ FAQデータベース ---")
    faq_lines.append("以下は、お弁当デリでお客様からよくあるご質問（FAQ）と、その回答の公式データです。")
    faq_lines.append("ルール：お客様からの問い合わせが以下のQ&Aに該当する場合、この回答の仕様・ルールに沿って案内してください。\n")
    
    current_category = ""
    
    with open(input_file, 'r', encoding='utf-8') as f:
        reader = csv.reader(f)
        header = next(reader, None)  # Skip header
        
        for row in reader:
            if not row or len(row) < 6:
                continue
            
            category = row[0].strip()
            # col 1 is icon, col 2 is Q, col 3 is Tags, col 4 is part type, col 5 is A
            question = row[2].strip()
            answer = row[5].strip()
            
            if not question:
                continue
            if "ファイルアップロードのため文章形式に変換されています" in answer:
                continue
            
            if category and category != current_category:
                current_category = category
                faq_lines.append(f"■ カテゴリ：【{current_category}】\n")
            
            faq_lines.append(f"Q: {question}")
            
            # Formatting answer
            lines = answer.split('\n')
            formatted_answer = []
            for line in lines:
                if line.strip():
                    formatted_answer.append(f"A: {line.strip()}" if not formatted_answer else f"   {line.strip()}")
            faq_lines.append("\n".join(formatted_answer))
            faq_lines.append("-" * 40 + "\n")

    with open(output_file, 'w', encoding='utf-8') as f:
        f.write("\n".join(faq_lines))

if __name__ == "__main__":
    convert_csv_to_text('/tmp/faq_data.csv', '/Volumes/SSD-PGU3C/返信作成AIツール/faq.txt')
    print("Successfully converted FAQ data to faq.txt")
