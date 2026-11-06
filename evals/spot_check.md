# Spot Check: 15 Sampled Retrieval Evaluation Questions

These 15 questions were randomly sampled from `evals/questions_real.json` (OpenStax *Introduction to Python Programming*, Chapters 1-4) to verify:
1. Paraphrasing quality (no copying of 5 or more consecutive words from the source chunk).
2. Ground truth alignment (`gold_answer` is an exact substring from the source chunk).
3. Expected target citation accuracy (`expected_targets` matches source file and page).

---

## 1. Question `rq21`
**Question**: Which specific social media and web platform is mentioned as being constructed using the Django framework in Python?
**Target Document**: `chapter_02_expressions.pdf`, Page 27 (Chunk ID: 8397)
**Gold Answer**: `Instagram`

**Source Chunk Text**:
> Application Example use of Python Scientific computing Python is very useful for conducting experiments and analyzing data. Ex: The SciPy project (https://openstax.org/r/100scipyproject). Web development Python can run interactive websites. Ex: Instagram is built with Django (https://openstax.org/r/100django), a Python framework. Table 2.9 Applications built with Python. CONCEPTS IN PRACTICE Fields and applications 1 . Which of the following fields use Python to support their work? a. geography b. health care c. political science d. all of the above 2 . Which of the following Python libraries creates charts and plots? a. Matplotlib b. SciPy c. TensorFlow 3 . Which of the following applications were built with Python? a. Facebook b. Instagram c. WhatsApp EXPLORING FURTHER For more examples of applications that can be built with Python, see "Top 12 Fascinating Python Applications in Real-World" (https://openstax.org/r/100top12apps) by Rohit Sharma. For more information about Python related careers, see "What Does a Python Developer Do?" (https://openstax.org/r/100careers) in BrainStation's career guide. 2.9 Chapter summary Highlights from this chapter include: • Expressions and statements can be run interactively using a shell. • Input strings can be converted to other types. Ex: int(input()). • Strings can be concatenated with other types. Ex: "$" + str(cost). • Floats are subject to round-off and overflow errors. • Integers can be divided exactly using // and %. • Modules like math provide many useful functions. • Formatting long lines helps improve readability. 2.9 • Chapter summary 63

---

## 2. Question `rq04`
**Question**: What is the name of the online Q&A platform for software developers mentioned in the text?
**Target Document**: `chapter_01_statements.pdf`, Page 26 (Chunk ID: 8366)
**Gold Answer**: `Stack Overflow`

**Source Chunk Text**:
> had been #1 for the previous 20 years. Another way to see Python's popularity is to analyze how frequently Python is discussed online. Stack Overflow (https://openstax.org/r/100overflow) is a question-and-answer website for programmers. Figure 1.3 shows the number of questions asked each month that were tagged with Python, JavaScript, and so forth. In recent years, Python has become the most asked about language in programming forums. Figure 1.2 TIOBE programming community index. Source: www.tiobe.com (https://www.tiobe.com/tiobe-index/) Figure 1.3 Stack Overflow questions per month. Source: data.stackexchange.com 32 1 • Statements Access for free at openstax.org

---

## 3. Question `rq01`
**Question**: What kind of prefix is placed before a string literal to designate it as an f-string?
**Target Document**: `chapter_03_objects.pdf`, Page 6 (Chunk ID: 8406)
**Gold Answer**: `"f" or "F"`

**Source Chunk Text**:
> The program should then shift each letter of the word by the desired amount. Based on the example above, the output would be: The secret message is: FDW Hint: Use the ord() function to convert each letter to an integer, add the shift amount to each integer, use the chr() function to convert each integer to a character, and concatenate the resulting characters. Access multimedia content (http://openstax.org/books/introduction-python-programming/pages/ 3-1-strings-revisited) 3.2 Formatted strings Learning objectives By the end of this section you should be able to • Use f-strings to simplify output with multiple values. • Format numbers with leading zeros and fixed precision. F-strings A formatted string literal (or f-string) is a string literal that is prefixed with "f" or "F". A replacement field is an expression in curly braces ({}) inside an f-string. Ex: The string f"Good morning, {first} {last}!" has two replacement fields: one for a first name, and one for a last name. F-strings provide a convenient way to combine multiple values into one string. CHECKPOINT Printing an f-string Printing an f-string; ch 3, video 2 (https://www.openstax.org/r/printing-f-string) CONCEPTS IN PRACTICE Basic f-strings 1 . What is the output of the following code? animal = "dog" says = "bark" print(f"My {animal} says {says} {says} {says}") a. My dog bark bark bark bark b. My dog says bark bark bark c. Error 2 . What is the output of the following code? temp = "hot" 72 3 • Objects Access for free at openstax.org

---

## 4. Question `rq24`
**Question**: What Python function does the hint suggest utilizing to prevent floating-point calculation errors?
**Target Document**: `chapter_02_expressions.pdf`, Page 15 (Chunk ID: 8385)
**Gold Answer**: `round()`

**Source Chunk Text**:
> Current minute (0-59)? 25 Trip time (in minutes)? 340 In this example, the current time is 13:25 (1:25pm). The trip time is 340 minutes (5 hours and 40 minutes). 340 minutes after 13:25 is 19:05 (7:05pm). Your program should output the result in this format: Arrival hour is 19 Arrival minute is 5 The arrival hour must be between 0 and 23. Ex: Adding 120 minutes to 23:00 should be 1:00, not 25:00. The arrival minute must be between 0 and 59. Ex: Adding 20 minutes to 8:55 should be 9:15, not 8:75. Hint: Multiply the current hour by 60 to convert hours to minutes. Then, calculate the arrival time, in total minutes, as an integer. Your code must not use Python keywords from later chapters, such as if or while. The solution requires only addition, multiplication, division, and modulo. Access multimedia content (http://openstax.org/books/introduction-python-programming/pages/ 2-5-dividing-integers) Change machine Self-checkout aisles are becoming increasingly popular at grocery stores. Customers scan their own items, and a computer determines the total purchase amount. Customers who pay in cash insert dollar bills, and a machine automatically dispenses change in coins. That's where this program comes into the story. Your task is to calculate how many of each coin to dispense. Your program should use the following prompts (user input in bold): Total amount? 18.76 Cash payment? 20 You may assume that the cash paid will always be a whole number (representing dollar bills) that is greater than or equal to the total amount. The program should calculate and output the amount of change due and how many dollars, quarters, dimes, nickels, and pennies should be dispensed: Change Due $1.24 Dollars: 1 Quarters: 0 Dimes: 2 Nickels: 0 Pennies: 4 Hint: Calculate the total change, in cents, as an integer. Use the round() function to avoid floating-point errors. TRY IT 2.5 • Dividing integers 51

---

## 5. Question `rq09`
**Question**: What is the term for a container capable of holding multiple items within a program?
**Target Document**: `chapter_03_objects.pdf`, Page 1 (Chunk ID: 8401)
**Gold Answer**: `container`

**Source Chunk Text**:
> Figure 3.1 credit: modification of work "Port of Melbourne", by Chris Phutully/Flickr, CC BY 2.0 Chapter Outline 3.1 Strings revisited 3.2 Formatted strings 3.3 Variables revisited 3.4 List basics 3.5 Tuple basics 3.6 Chapter summary Introduction An object is a single unit of data in a Python program. So far, this book has introduced three types of objects: strings, integers, and floats. This chapter takes a closer look at how strings are represented and how integers and floats can be formatted. To better understand what an object actually is, the relationship between variables and objects is emphasized. The chapter also introduces two types of containers: lists and tuples. A container is an object that can hold an arbitrary number of other objects. At the end of this chapter, you will be able to solve more complex problems using fewer variables. 3.1 Strings revisited Learning objectives By the end of this section you should be able to • Extract a specific character from a string using an index. • Use escape sequences to represent special characters. Indexes A string is a sequence of zero or more characters. Each character has an index that refers to the character's position. Indexes are numbered from left to right, starting at 0. Indexes are also numbered from right to left, Objects 3

---

## 6. Question `rq08`
**Question**: What is the outcome when evaluating whether 8 is smaller than or equal to 7?
**Target Document**: `chapter_04_decisions.pdf`, Page 28 (Chunk ID: 8446)
**Gold Answer**: `False`

**Source Chunk Text**:
> Function Description x <= y (Less than or equal) Compares the values of x and y and returns True if the x is less than or equal to y and False otherwise. Ex: 8 <= 7 is False. x and y (Logical) Evaluates the Boolean values of x and y and returns True if both are true. Ex: True and False is False. x or y (Logical) Evaluates the Boolean values of x and y and returns True if either is true. Ex: True or False is True. not x (Logical) Evaluates the Boolean value of x and returns True if the value is false and False if the value is true. Ex: not True is False. Decision statement Description if statement # Statements before if condition: # Body # Statements after else statement # Statements before if condition: # Body else: # Body # Statements after Table 4.5 Chapter 4 reference. 112 4 • Decisions Access for free at openstax.org

---

## 7. Question `rq25`
**Question**: What is the function utilized alongside list indexes in the concepts in practice section?
**Target Document**: `chapter_03_objects.pdf`, Page 14 (Chunk ID: 8414)
**Gold Answer**: `len()`

**Source Chunk Text**:
> 11 12 # The desired value of the 4th element is actually 7 13 # Update the value of the 4th element to 7 14 num_list[3] = 7 15 16 # The list of the first 5 prime numbers 17 print(num_list) The above code's output is: [2, 3, 5, 9, 11] Length: 5 4th element: 9 [2, 3, 5, 7, 11] CONCEPTS IN PRACTICE List indexes and the len() function 3 . Which is the correct way to access the 17th element in a list called cardList? a. card_list[17] b. 16)card_list(16) c. card_list[16] 4 . What is the correct way to modify the element "Tom" to "Tim" in the following list? name_list = ["Carla", "Monique", "Westin", "Tom"] a. name_list[-1] = "Tim" b. name_list[4] = "Tim" c. name_list[end] = "Tim" List basics Write a program to complete the following: 1. Create a list with the following elements: 2, 23, 39, 6, -5. 2. Change the third element of the list (index 2) to 35. 3. Print the resulting list and the list's length. Access multimedia content (http://openstax.org/books/introduction-python-programming/pages/3-4-list- basics) TRY IT 80 3 • Objects Access for free at openstax.org

---

## 8. Question `rq05`
**Question**: What mechanism does the Python interpreter employ to automatically shift a variable's data type when common operations require it?
**Target Document**: `chapter_02_expressions.pdf`, Page 4 (Chunk ID: 8374)
**Gold Answer**: `implicit type conversion`

**Source Chunk Text**:
> • abs(5) • len("Yo") • len("HoHo") • round(9.49) • round(9.50) Note: These functions (type, str, int, len, and round) will be explored in more detail later in the chapter. You can read more about the built-in functions (https://openstax.org/r/100builtin) in the Python documentation. Correcting mistakes Open a Python shell on your computer, or use the one at python.org/shell (https://openstax.org/r/ 100pythonshell). Run the following two statements in the shell: • x = 123 • y = 456 Making mistakes is common while typing in a shell. The following lines include typos and other errors. For each line: (1) run the line in a shell to see the result, (2) press the up arrow to repeat the line, and (3) edit the line to get the correct result. • print("Easy as", X) • print("y divided by 2 is", y / 0) • name = intput("What is your name? ") • print(name, "is", int(name), "letters long.") • print("That's all folks!) The expected output, after correcting typos, should look like: • Easy as 123 • y divided by 2 is 228.0 • (no error/output) • Stacie is 6 letters long. • That's all folks! 2.2 Type conversion Learning objectives By the end of this section you should be able to • Explain how the interpreter uses implicit type conversion. • Use explicit type conversion with int(), float(), and str(). Implicit type conversion Common operations update a variable such that the variable's data type needs to be changed. Ex: A GPS first assigns distance with 250, an integer. After a wrong turn, the GPS assigns distance with 252.5, a float. The Python interpreter uses implicit type conversion to automatically convert one data type to another. Once distance is assigned with 252.5, the interpreter will convert distance from an integer to a float without the TRY IT 40 2 • Expressions Access for free at openstax.org

---

## 9. Question `rq29`
**Question**: Which Python math function returns the smallest integer that is not less than the input value x?
**Target Document**: `chapter_02_expressions.pdf`, Page 18 (Chunk ID: 8388)
**Gold Answer**: `math.ceil(x)`

**Source Chunk Text**:
> Function Description Examples Number-theoretic math.ceil(x) The ceiling of x: the smallest integer greater than or equal to x. math.ceil(7.4) 8 math.ceil(-7.4) -7 math.floor(x) The floor of x: the largest integer less than or equal to x. math.floor(7.4) 7 math.floor(-7.4) -8 Power and logarithmic math.log(x) The natural logarithm of x (to base e). math.log(math.e) 1.0 math.log(0) ValueError: math domain error math.log(x, base) The logarithm of x to the given base. math.log(8, 2) 3.0 math.log(10000, 10) 4.0 math.pow(x, y) x raised to the power y. Unlike the ** operator, math.pow() converts x and y to type float. math.pow(3, 0) 1.0 math.pow(3, 3) 27.0 math.sqrt(x) The square root of x. math.sqrt(9) 3.0 math.sqrt(-9) ValueError: math domain error Trigonometric math.cos(x) The cosine of x radians. math.cos(0) 1.0 math.cos(math.pi) -1.0 math.sin(x) The sine of x radians. math.sin(0) 0.0 math.sin(math.pi/2) 1.0 math.tan(x) The tangent of x radians. math.tan(0) 0.0 math.tan(math.pi/4) 0.999 (Round-off error; the result should be 1.0.) Table 2.4 Example functions in the math module. 54 2 • Expressions Access for free at openstax.org

---

## 10. Question `rq18`
**Question**: What term is used to describe the specific unit employed to divide an amount in these types of conversions?
**Target Document**: `chapter_02_expressions.pdf`, Page 14 (Chunk ID: 8384)
**Gold Answer**: `modulus`

**Source Chunk Text**:
> Unit conversions Division is useful for converting one unit of measure to another. To convert centimeters to meters, a variable is divided by 100. Ex: 300 centimeters divided by 100 is 3 meters. Amounts often do not divide evenly as integers. 193 centimeters is 1.93 meters, or 1 meter and 93 centimeters. A program can use floor division and modulo to separate the units: • The quotient, 1 meter, is 193 // 100. • The remainder, 93 centimeters, is 193 % 100. Programs often use floor division and modulo together. If one line of code floor divides by m, the next line will likely modulo by m. The unit m by which an amount is divided is called the modulus. Ex: When converting centimeters to meters, the modulus is 100. CHECKPOINT Money and time Money and time; ch 2, video 9 (https://www.openstax.org/r/money-time) CONCEPTS IN PRACTICE Unit conversions 5 . What is the modulus for converting minutes to hours? a. 40 b. 60 c. 280 6 . A program has the line pounds = ounces // 16. What is likely the next line of code? a. ounces = ounces % 16 b. pounds = ounces % 16 c. ounces = ounces - pounds * 16 Arrival time Having a mobile device can be a lifesaver on long road trips. Programs like Google Maps find the shortest route and estimate the time of arrival. The time of arrival is based on the current time plus how long the trip will take. Write a program that (1) inputs the current time and estimated length of a trip, (2) calculates the time of arrival, and (3) outputs the results in hours and minutes. Your program should use the following prompts (user input in bold): 13 Current minute (0-59)? 25 Trip time (in minutes)? 340 Current hour (0-23)? 13 TRY IT 50 2 • Expressions Access for free at openstax.org

---

## 11. Question `rq03`
**Question**: In the second practice exercise where x equals 42 and y equals 0, what does y ultimately evaluate to?
**Target Document**: `chapter_04_decisions.pdf`, Page 18 (Chunk ID: 8436)
**Gold Answer**: `5`

**Source Chunk Text**:
> CHECKPOINT Example: Livestream features Example: Livestream features; ch 4, video 12 (https://www.openstax.org/r/livestream) CONCEPTS IN PRACTICE Using elif 1 . Fill in the blank to execute Body 2 when condition_1 is false and condition_2 is true. if condition_1: # Body 1 __ condition_2: # Body 2 a. if b. elif c. else 2 . Given x = 42 and y = 0, what is the final value of y? if x > 44: y += 2 elif x < 50: y += 5 a. 2 b. 5 c. 7 3 . Which conditions complete the code such that if x is less than 0, Body 1 executes, else if x equals 0, Body 2 executes. if _________: # Body 1 elif _________: # Body 2 a. x < 0 x == 0 b. x == 0 x < 0 c. x <= 0 [no condition] 4 . Which of the following is a valid chained decision statement? a. if condition_1: # Body 1 elif condition_2: 102 4 • Decisions Access for free at openstax.org

---

## 12. Question `rq19`
**Question**: What is the name of the logical operator that accepts a single condition operand and reverses its boolean outcome?
**Target Document**: `chapter_04_decisions.pdf`, Page 12 (Chunk ID: 8430)
**Gold Answer**: `not`

**Source Chunk Text**:
> CHECKPOINT Example: Streaming prompt Example: Streaming prompt; ch 4, video 7 (https://www.openstax.org/r/streaming-prompt) CONCEPTS IN PRACTICE Using the or operator 5 . Given days = 21 and is_damaged is False, is the refund processed? if (days < 30) or is_damaged: # Process refund a. yes b. no 6 . For what values of age is there no discount? if (age < 12) or (age > 65): # Apply student/senior discount a. age >= 12 b. age <= 65 c. (age >= 12) and (age <= 65) 7 . Given a = 9 and b = 10, does the test pass? if (a%2 == 0 and b%2 == 1) or (a%2 == 1 and b%2 == 0): # Test passed else: # Test failed a. yes b. no Logical operator: not If the computer is not on, press the power button. The not operator takes one condition operand and returns True when the operand is false and returns False when the operand is true. not is a useful operator that can make a condition more readable and can be used to toggle a Boolean's value. Ex: is_on = not is_on. 96 4 • Decisions Access for free at openstax.org

---

## 13. Question `rq14`
**Question**: What numeric code point corresponds to the capital letter A according to the provided table?
**Target Document**: `chapter_03_objects.pdf`, Page 3 (Chunk ID: 8403)
**Gold Answer**: `65`

**Source Chunk Text**:
> points and supports most of the world's written languages. 32 (space) 33 ! 34 " 35 # 36 $ 37 % 38 & 39 ' 40 ( 41 ) 42 * 43 + 44 , 45 - 46 . 47 / 48 0 49 1 50 2 51 3 52 4 53 5 54 6 55 7 56 8 57 9 58 : 59 ; 60 < 61 = 62 > 63 ? 64 @ 65 A 66 B 67 C 68 D 69 E 70 F 71 G 72 H 73 I 74 J 75 K 76 L 77 M 78 N 79 O 80 P 81 Q 82 R 83 S 84 T 85 U 86 V 87 W 88 X 89 Y 90 Z 91 [ 92 \ 93 ] 94 ^ 95 _ 96 ` 97 a 98 b 99 c 100 d 101 e 102 f 103 g 104 h 105 i 106 j 107 k 108 l 109 m 110 n 111 o 112 p 113 q 114 r 115 s 116 t 117 u 118 v 119 w 120 x 121 y 122 z 123 { 124 | 125 } 126 ~ 127 (delete) Table 3.1 Character values. This table shows code points 32 to 127 as defined by ASCII and Unicode. Code points 0 to 31 are non-printable characters that were used for telecommunications. CONCEPTS IN PRACTICE ord() and chr() 4 . What is the code point for the letter A? a. 1 b. 65 c. 97 3.1 • Strings revisited 69

---

## 14. Question `rq02`
**Question**: What type of function is always available for use without requiring an explicit import statement?
**Target Document**: `chapter_02_expressions.pdf`, Page 16 (Chunk ID: 8386)
**Gold Answer**: `built-in function`

**Source Chunk Text**:
> Your code must not use Python keywords from later chapters, such as if or while. The solution requires only subtraction, multiplication, division, and modulo. Access multimedia content (http://openstax.org/books/introduction-python-programming/pages/ 2-5-dividing-integers) 2.6 The math module Learning objectives By the end of this section you should be able to • Distinguish between built-in functions and math functions. • Use functions and constants defined in the math module. Importing modules Python comes with an extensive standard library (https://openstax.org/r/100pythlibrary) of modules. A module is previously written code that can be imported in a program. The import statement defines a variable for accessing code in a module. Import statements often appear at the beginning of a program. The standard library also defines built-in functions such as print(), input(), and float(). A built-in function is always available and does not need to be imported. The complete list of built-in functions (https://openstax.org/r/100builtin) is available in Python's official documentation. A commonly used module in the standard library is the math module (https://openstax.org/r/ 100mathmodule). This module defines functions such as sqrt() (square root). To call sqrt(), a program must import math and use the resulting math variable followed by a dot. Ex: math.sqrt(25) evaluates to 5.0. The following program imports and uses the math module, and uses built-in functions for input and output. EXAMPLE 2.1 Calculating the distance between two points import math x1 = float(input("Enter x1: ")) y1 = float(input("Enter y1: ")) x2 = float(input("Enter x2: ")) y2 = float(input("Enter y2: ")) distance = math.sqrt((x2-x1)**2 + (y2-y1)**2) print("The distance is", distance) 52 2 • Expressions Access for free at openstax.org

---

## 15. Question `rq28`
**Question**: Which built-in function should you use to find the memory location of a given object?
**Target Document**: `chapter_03_objects.pdf`, Page 18 (Chunk ID: 8418)
**Gold Answer**: `id(object)`

**Source Chunk Text**:
> Code Description '\t' Escape sequence for the tab character. f"{number:.02d}" Creates a string by formatting an integer to be at least two digits. f"{number:.2f}" Creates a string by formatting a float to have two decimal places. id(object) Gets the identity (memory location) of an object. type(object) Gets the type (class name) of an object. my_list = ["a", "b", "c"] Creates a list of three strings. my_tuple = ("a", "b", "c") Creates a tuple of three strings. my_list[0] Gets the first element ("a") of my_tuple. my_tuple[-1] Gets the last element ("c") of my_tuple. Table 3.5 Chapter 3 reference. 84 3 • Objects Access for free at openstax.org

---
