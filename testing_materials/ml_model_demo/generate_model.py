import os
import joblib
from sklearn.ensemble import RandomForestClassifier
import numpy as np

# Train a simple model to evaluate customer churn
print("Training Churn Prediction Model...")
X = np.random.rand(100, 5) # 5 features: Age, Balance, Products, Active, Salary
y = np.random.randint(2, size=100) # 0 = Retain, 1 = Churn

model = RandomForestClassifier(n_estimators=10)
model.fit(X, y)

# Save the model
filename = "churn_predictor.joblib"
joblib.dump(model, filename)

print(f"✅ Successfully created {filename}!")
print("Upload this file directly to the 'Deploy ML Model' tab in your dashboard.")
