import sys

def remove_empty_lines(file_path):
    with open(file_path, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    
    # Filter out empty or completely whitespace lines
    non_empty_lines = [line for line in lines if line.strip()]
    
    with open(file_path, 'w', encoding='utf-8') as f:
        f.writelines(non_empty_lines)
    print(f"Removed empty lines from {file_path}")

if __name__ == "__main__":
    file_path = r"c:\Users\vamsi\OneDrive\Documents\SreevaAI\components\careers\interview\HardwareCheck.tsx"
    remove_empty_lines(file_path)
