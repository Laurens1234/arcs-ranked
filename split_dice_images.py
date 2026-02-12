#!/usr/bin/env python3
"""
Dice Image Splitter
Splits 3x3 dice face grids into individual face images
"""

import os

from PIL import Image


def split_dice_image(image_path, output_dir):
    """
    Split a 3x3 dice image into 9 individual face images

    Args:
        image_path: Path to the dice image
        output_dir: Directory to save the split images
    """
    # Open the image
    img = Image.open(image_path)

    # Get image dimensions
    width, height = img.size

    # Calculate piece dimensions
    piece_width = width // 3
    piece_height = height // 3

    # Get the base filename without extension
    base_name = os.path.splitext(os.path.basename(image_path))[0]

    # Create output directory if it doesn't exist
    os.makedirs(output_dir, exist_ok=True)

    # Split into 3x3 grid
    for row in range(3):
        for col in range(3):
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
    input_dir = "dice/images"
    output_dir = "dice/faces"

    # Dice image files
    dice_files = [
        "assault-die.png",
        "skirmish-die.png",
        "raid-die.png"
    ]

    print("Splitting dice images into individual faces...")

    for dice_file in dice_files:
        image_path = os.path.join(input_dir, dice_file)
        if os.path.exists(image_path):
            print(f"\nProcessing: {dice_file}")
            split_dice_image(image_path, output_dir)
        else:
            print(f"Warning: {image_path} not found")

    print("\nDone! Check the 'dice/faces' directory for the split images.")
    print("\nNaming convention: {die_type}_r{row}_c{col}.png")
    print("- r0 = top row, r1 = middle row, r2 = bottom row")
    print("- c0 = left column, c1 = middle column, c2 = right column")

if __name__ == "__main__":
    main()