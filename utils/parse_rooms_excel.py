import pandas as pd
import shutil
import os
import json


# Load the Excel file
file_path = r"E:\OneDrive - AXXIS\NEXUS\Configurator\BRIEF.xlsx"  # Update this to your Excel file path
sheet_name = "ROOM SPECIFICATIONS"
df = pd.read_excel(file_path, sheet_name=sheet_name)

# Initialize the rooms dictionary
rooms = []

id_row_indices = df[df.iloc[:, 2].astype(str).str.lower() == "id"].index.tolist()

for row_id in id_row_indices:
    room_name_id = row_id-1
    room_name = df.iloc[room_name_id, 1]
    room_ID_value = df.iloc[room_name_id, 0]
    
    for i in range(1,4):
        attrib_name_col = 2
        row = row_id  # Start from the row after "ID"
        room_id = df.iloc[row, 2+i]
        room = {}
        room["Room ID"] = room_ID_value
        room["ID"] = room_id
        room["Name"] = room_name
        room["Tier_ID"] = i
        room["Tier"] = df.iloc[1, 2+i]
        row += 1

        while row < len(df):
            attribute_name = df.iloc[row, attrib_name_col]
            if pd.isna(attribute_name) or str(attribute_name).strip() == "": break            
            attrib_value = df.fillna("").iloc[row, attrib_name_col + i]
            attrib_report = df.iloc[row, 8]
            attribute = {
                "Value": attrib_value,
                "Report": attrib_report
            }
            room[attribute_name] = attribute         
            row += 1

        rooms.append(room)
print(rooms)

rooms_json_file = r"src\rooms.json"

with open(rooms_json_file, "w", encoding="utf-8") as f:
    json.dump(rooms, f, indent=2)
