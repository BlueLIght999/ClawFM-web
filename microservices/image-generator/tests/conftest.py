"""Pytest configuration and shared fixtures."""
import sys
import os

# Ensure the microservice root is on sys.path so `from app.xxx import ...` works
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
