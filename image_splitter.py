#!/usr/bin/env python3
"""
Image Splitter
Splits images in grid to individual
"""

import os

from PIL import Image

image_width = 7
image_col = 5

def split_image(image_path, output_dir):
    """
    Split a nxn image into n individual images

    Args:
        image_path: Path to the image
        output_dir: Directory to save the split images
    """
    # Open the image
    img = Image.open(image_path)

    # Get image dimensions
    width, height = img.size

    # Calculate piece dimensions
    piece_width = width // image_width
    piece_height = height // image_col

    # Get the base filename without extension
    base_name = os.path.splitext(os.path.basename(image_path))[0]

    # Create output directory if it doesn't exist
    os.makedirs(output_dir, exist_ok=True)

    for row in range(image_col):
        for col in range(image_width):
            # Calculate crop coordinates
            left = col * piece_width
            top = row * piece_height
            right = left + piece_width
            bottom = top + piece_height

            # Crop the piece
            piece = img.crop((left, top, right, bottom))

            # Save the piece
            piece_filename = f"{base_name}_r{row}_c{col}.png"
            piece_path = os.path.join(output_dir, piece_filename)
            piece.save(piece_path)

            print(f"Saved: {piece_path}")

def main():
    # Input and output directories
    input_dir = "CardImages/"
    output_dir = "CardImages"

    # image files
    files = [
        "Believer_cards.jpg"
    ]

    print("Splitting images into individual faces...")

    for file in files:
        image_path = os.path.join(input_dir, file)
        if os.path.exists(image_path):
            print(f"\nProcessing: {file}")
            split_image(image_path, output_dir)
        else:
            print(f"Warning: {image_path} not found")

    print("\nDone! Check the  directory for the split images.")
    print("\nNaming convention: {type}_r{row}_c{col}.png")
    print("- r0 = top row, r1 = bottom row")
    print("- c0-c6 = left to right columns")

if __name__ == "__main__":
    main()