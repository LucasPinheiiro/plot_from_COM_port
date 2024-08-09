import json
import numpy as np
import sys

def load_json_file(file_path):
    try:
        with open(file_path, 'r') as file:
            data = json.load(file)
        return data
    except FileNotFoundError:
        print(f"Error: The file {file_path} was not found.", file=sys.stderr)
        sys.exit(1)
    except json.JSONDecodeError:
        print(f"Error: The file {file_path} is not a valid JSON file.", file=sys.stderr)
        sys.exit(1)

def extract_data(data, key):
    try:
        return np.array(data[key])
    except KeyError:
        print(f"Error: Key '{key}' not found in the JSON data.", file=sys.stderr)
        sys.exit(1)

def determine_capacity_type(ibat):
    # Check if any current value is less than -5 mA
    if np.any(ibat < -5):  # ibat values are assumed to be in Amperes
        return 'discharging'  # Discharge
    else:
        return 'charging'  # Charging

def main():
    file_path = 'plotdata.json'
    
    # Step 1: Load the JSON file
    data = load_json_file(file_path)
    
    # Step 2: Extract 'labels', 'ibat', and 'vbat'
    labels = extract_data(data, 'labels')
    ibat = extract_data(data, 'ibat')
    vbat = extract_data(data, 'vbat')
    
    # Step 3: Determine capacity type automatically
    capacity_type = determine_capacity_type(ibat)
    
    if capacity_type == 'discharging':
        # Discharge capacity: Filter the points where 'ibat' is negative and 'vbat' is greater than 18V
        valid_indices = (ibat < 0) & (vbat > 18)
    elif capacity_type == 'charging':
        # Charging capacity: Filter the points where 'ibat' is positive
        valid_indices = ibat > 0
    
    filtered_ibat = ibat[valid_indices]
    filtered_labels = labels[valid_indices]
    
    # Step 4: Compute the discrete integral using the trapezoidal rule
    if len(filtered_ibat) == 0 or len(filtered_labels) == 0:
        print("Error: No valid points found for the selected capacity type.", file=sys.stderr)
        sys.exit(1)
    
    integral = np.trapz(filtered_ibat, filtered_labels)
    
    # Step 5: Take the absolute value of the integral and convert to milliampere-hours
    integral_mAh = round(abs(integral) / 3600)
    
    # Step 6: Return the capacity value and the type
    print(f"{integral_mAh} mAh {capacity_type}")

if __name__ == "__main__":
    main()
