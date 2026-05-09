import os
import pickle
import joblib
from sklearn.datasets import load_iris
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression

os.makedirs("ml_models", exist_ok=True)

print("Loading Iris dataset...")
iris = load_iris()
X, y = iris.data, iris.target

print("Training Random Forest...")
rf = RandomForestClassifier(n_estimators=10, random_state=42)
rf.fit(X, y)
with open("ml_models/random_forest_iris.pkl", "wb") as f:
    pickle.dump(rf, f)

print("Training Logistic Regression...")
lr = LogisticRegression(max_iter=200, random_state=42)
lr.fit(X, y)
joblib.dump(lr, "ml_models/logistic_regression_iris.joblib")

print("ML models created successfully in 'testing_materials/ml_models' directory.")
