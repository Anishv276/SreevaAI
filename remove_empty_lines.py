import os
import sys

def remove_empty_lines(file_path):
    if not os.path.exists(file_path):
        print(f"Error: File {file_path} does not exist.")
        return

    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            lines = f.readlines()

        # Filter out lines that are only whitespace or empty
        cleaned_lines = [line for line in lines if line.strip()]

        with open(file_path, 'w', encoding='utf-8') as f:
            f.writelines(cleaned_lines)
        
        print(f"Successfully cleaned {file_path}. Removed {len(lines) - len(cleaned_lines)} empty lines.")
    except Exception as e:
        print(f"An error occurred: {e}")

if __name__ == "__main__":
    if len(sys.argv) > 1:
        remove_empty_lines(sys.argv[1])
    else:
        # Default to the target file if no argument is provided
        remove_empty_lines(r"c:\Users\vamsi\OneDrive\Desktop\HR-updates\app\admin\candidates\page.tsx")
