# Spot Check: 15 Sampled Retrieval Evaluation Questions [Set B]

These 15 questions were randomly sampled from `questions_real_b.json` (OpenStax *Introduction to Python Programming*, Chapters 1-4, seed=43) to verify:
1. Rule (a): No practice exercises, checkpoint questions, chapter outlines, or section headings only.
2. Rule (b): Zero meta-language words (no 'exercise', 'section', 'outline', 'chapter', 'practice', 'concepts in practice', or 'hint').
3. Rule (c): `gold_answer` is >= 4 chars and appears in exactly ONE chunk across the entire corpus.
4. Rule (d): Fully paraphrased (zero copies of 5 or more consecutive words from source chunk).
5. Rule (e): Expected target citation matches source file and page.

---

## 1. Question `rq_b_02`
**Question**: What kind of mistake is associated with question number 5 in the provided text where quotation marks are missing?
**Target Document**: `chapter_01_statements.pdf`, Page 20 (Chunk ID: 8360)
**Gold Answer**: `SyntaxError 5`

**Source Chunk Text**:
> c. SyntaxError 5 . birth = input("Enter your birth date: ) print("Happy birthday on ", birth) a. IndentationError b. NameError c. SyntaxError 6 . print("Breakfast options:") print(" A. Cereal") print(" B. Eggs") print(" C. Yogurt") choice = intput("What would you like? ") a. IndentationError b. NameError c. SyntaxError Three errors The following program has three errors. • Run the program to find the first error, and correct the corresponding line of code. • Then run the program again to find and correct the second error. • Keep running and correcting the program until no errors are found. Access multimedia content (http://openstax.org/books/introduction-python-programming/pages/1-6-error- messages) Wrong symbols This code is based on an earlier example, but the code contains several mistakes. • One line is missing required punctuation, and another line uses incorrect symbols. • Run the program to find the first error, and correct the corresponding line of code. • Keep running and correcting the program until no errors are found. Access multimedia content (http://openstax.org/books/introduction-python-programming/pages/1-6-error- messages) TRY IT TRY IT 26 1 • Statements Access for free at openstax.org

---

## 2. Question `rq_b_10`
**Question**: What is the primary function of the assignment symbol described in the reference guide?
**Target Document**: `chapter_01_statements.pdf`, Page 28 (Chunk ID: 8368)
**Gold Answer**: `Assigns (or updates) the value of a variable`

**Source Chunk Text**:
> Function Description = (Assignment) Assigns (or updates) the value of a variable. In Python, variables begin to exist when assigned for the first time. + (Concatenation) Appends the contents of two strings, resulting in a new string. + (Addition) Adds the values of two numbers. - (Subtraction) Subtracts the value of one number from another. * (Multiplication) Multiplies the values of two numbers. / (Division) Divides the value of one number by another. ** (Exponentiation) Raises a number to a power. Ex: 3**2 is three squared. Syntax Description # (Comment) All text is ignored from the # symbol to the end of the line. ' or " (String) Strings may be written using either kind of quote. Ex: 'A' and "A" represent the same string. By convention, this book uses double quotes (") for most strings. """ (Docstring) Used for documentation, often in multi-line strings, to summarize a program's purpose or usage. Table 1.6 Chapter 1 reference. Fun facts Write a program that assigns a variable named number to any integer of your choice. Ex: number = 74. Then, use this variable to calculate and output the following results: TRY IT 34 1 • Statements Access for free at openstax.org

---

## 3. Question `rq_b_23`
**Question**: What is the calculated individual tip amount shown in the example output?
**Target Document**: `chapter_02_expressions.pdf`, Page 30 (Chunk ID: 8400)
**Gold Answer**: `Tip per person: $3.89`

**Source Chunk Text**:
> Tip per person: $3.89 Total per person: $25.49 Your program should output all dollar amounts rounded to two decimal places. The output should be exactly six lines, as shown above. Notice the blank line before each section of the output. Notice also the space before but not after the dollar sign. Access multimedia content (http://openstax.org/books/introduction-python-programming/pages/ 2-9-chapter-summary) 66 2 • Expressions Access for free at openstax.org

---

## 4. Question `rq_b_25`
**Question**: What standard library feature establishes a variable to access previously written code?
**Target Document**: `chapter_02_expressions.pdf`, Page 16 (Chunk ID: 8386)
**Gold Answer**: `import statement`

**Source Chunk Text**:
> Your code must not use Python keywords from later chapters, such as if or while. The solution requires only subtraction, multiplication, division, and modulo. Access multimedia content (http://openstax.org/books/introduction-python-programming/pages/ 2-5-dividing-integers) 2.6 The math module Learning objectives By the end of this section you should be able to • Distinguish between built-in functions and math functions. • Use functions and constants defined in the math module. Importing modules Python comes with an extensive standard library (https://openstax.org/r/100pythlibrary) of modules. A module is previously written code that can be imported in a program. The import statement defines a variable for accessing code in a module. Import statements often appear at the beginning of a program. The standard library also defines built-in functions such as print(), input(), and float(). A built-in function is always available and does not need to be imported. The complete list of built-in functions (https://openstax.org/r/100builtin) is available in Python's official documentation. A commonly used module in the standard library is the math module (https://openstax.org/r/ 100mathmodule). This module defines functions such as sqrt() (square root). To call sqrt(), a program must import math and use the resulting math variable followed by a dot. Ex: math.sqrt(25) evaluates to 5.0. The following program imports and uses the math module, and uses built-in functions for input and output. EXAMPLE 2.1 Calculating the distance between two points import math x1 = float(input("Enter x1: ")) y1 = float(input("Enter y1: ")) x2 = float(input("Enter x2: ")) y2 = float(input("Enter y2: ")) distance = math.sqrt((x2-x1)**2 + (y2-y1)**2) print("The distance is", distance) 52 2 • Expressions Access for free at openstax.org

---

## 5. Question `rq_b_05`
**Question**: What text is displayed in the output example following the user's entry?
**Target Document**: `chapter_01_statements.pdf`, Page 7 (Chunk ID: 8347)
**Gold Answer**: `entered: Sophia`

**Source Chunk Text**:
> b. You entered: Sophia c. You entered:, Sophia 6 . What is the output if the user enters "six" as the input? print("Please enter a number: ") number = input() print("Value =", number) a. Value = six b. Value = 6 c. Value = number Frost poem Write a program that uses multiple print() statements to output the following poem by Robert Frost (https://openstax.org/r/100robertfrost). Each print() statement should correspond to one line of output. Tip: You don't need to write the entire program all at once. Try writing the first print() statement, and then click the Run button. Then write the next print() statement, and click the Run button again. Continue writing and testing the code incrementally until you finish the program. I shall be telling this with a sigh Somewhere ages and ages hence: Two roads diverged in a wood, and I-- I took the one less traveled by, And that has made all the difference. Access multimedia content (http://openstax.org/books/introduction-python-programming/pages/1-2-input- output) Name and likes Write a program that asks the following two questions (example input in bold): What is your name? Shakira What do you like? singing Output a blank line after reading the input. Then output the following message based on the input: Shakira likes singing Access multimedia content (http://openstax.org/books/introduction-python-programming/pages/1-2-input- TRY IT TRY IT 1.2 • Input/output 13

---

## 6. Question `rq_b_15`
**Question**: What geometric shape's surface area and volume formulas are presented in Table 2.6?
**Target Document**: `chapter_02_expressions.pdf`, Page 20 (Chunk ID: 8390)
**Gold Answer**: `right circular cylinder`

**Source Chunk Text**:
> Provided input Expected output a b c x1 x2 1 0 -4 2.0 -2.0 1 2 -3 1.0 -3.0 2 1 -1 0.5 -1.0 0 1 1 division by zero 1 0 1 math domain error Table 2.5 Access multimedia content (http://openstax.org/books/introduction-python-programming/pages/2-6-the- math-module) Cylinder formulas In geometry, the surface area and volume of a right circular cylinder can be computed as follows: Write the code for these two formulas in the program below. Hint: Your solution should use both math.pi and math.tau. Test your program using the following values for r and h: Provided input Expected output r h area volume 0 0 0.0 0.0 1 1 12.57 3.14 1 2 18.85 6.28 2.5 4.8 114.67 94.25 3.1 7.0 196.73 211.33 Table 2.6 TRY IT 56 2 • Expressions Access for free at openstax.org

---

## 7. Question `rq_b_12`
**Question**: What is the result when 74 is raised to the power of two according to the arithmetic examples in the text?
**Target Document**: `chapter_01_statements.pdf`, Page 29 (Chunk ID: 8369)
**Gold Answer**: `5476`

**Source Chunk Text**:
> 74 squared is 5476 74 cubed is 405224 One tenth of 74 is 7.4 74 plus 123 is 197 74 minus 456 is -382 Run the program multiple times, using a different integer each time. Your output should be mathematically correct for any integer that you choose. The point of this exercise is to perform basic arithmetic within a print statement. Do not use any other variables besides number. Your program should have only one assignment statement (at the beginning). Access multimedia content (http://openstax.org/books/introduction-python-programming/pages/ 1-9-chapter-summary) Mad lib A mad lib is a word game in which one person asks others for words to substitute into a pre-written story. The story is then read aloud with the goal of making people laugh. This exercise is based the Vacations Mad Lib (https://openstax.org/r/100madlibs) available on the Printables (https://openstax.org/r/100printable) section of MadLibs.com. Write a program that asks the user to input two adjectives and two nouns (user input in bold): Adjective: tranquil Adjective: scandalous Noun: pancake Noun: field Use input() to display each prompt exactly as shown. The user's input should be on the same line as the prompt. Each colon must be followed by exactly one space. After reading the input, the program should output the following three lines: A vacation is when you take a trip to some tranquil place with your scandalous family. Usually you go to some place that is near a/an pancake or up on a/an field. Notice that the first line should be completely blank. Replace the bold words (from the above example) with the actual words input by the user. Your final program should have four input statements, three print statements, and at least two comments. For completeness, write an appropriate docstring at the top of the program. Access multimedia content (http://openstax.org/books/introduction-python-programming/pages/ 1-9-chapter-summary) TRY IT 1.9 • Chapter summary 35

---

## 8. Question `rq_b_22`
**Question**: What is the specific nanometer wavelength range specified for the color orange in the text?
**Target Document**: `chapter_04_decisions.pdf`, Page 22 (Chunk ID: 8440)
**Gold Answer**: `590–624`

**Source Chunk Text**:
> • Orange: 590–624 • Red: 625–750 Assume the input is within the visible light spectrum, 380-750 inclusive. Given input: 550 The output is: Green Access multimedia content (http://openstax.org/books/introduction-python-programming/pages/ 4-5-chained-decisions) 4.6 Nested decisions Learning objectives By the end of this section you should be able to • Describe the execution paths of programs with nested if-else statements. • Implement a program with nested if-else statements. Nested decision statements Suppose a programmer is writing a program that reads in a game ID and player count and prints whether the user has the right number of players for the game. The programmer may start with: if game == 1 and players < 2: print("Not enough players") if game == 1 and players > 4: print("Too many players") if game == 1 and (2 <= players <= 4): print("Ready to start") if game == 2 and players < 3: print("Not enough players") if game == 2 and players > 6: print("Too many players") if game == 2 and (3 <= players <= 6): print("Ready to start") The programmer realizes the code is redundant. What if the programmer could decide the game ID first and then make a decision about players? Nesting allows a decision statement to be inside another decision statement, and is indicated by an indentation level. An improved program: 106 4 • Decisions Access for free at openstax.org

---

## 9. Question `rq_b_04`
**Question**: What function call is used in the text to determine the length of the string "Yo"?
**Target Document**: `chapter_02_expressions.pdf`, Page 4 (Chunk ID: 8374)
**Gold Answer**: `len("Yo"`

**Source Chunk Text**:
> • abs(5) • len("Yo") • len("HoHo") • round(9.49) • round(9.50) Note: These functions (type, str, int, len, and round) will be explored in more detail later in the chapter. You can read more about the built-in functions (https://openstax.org/r/100builtin) in the Python documentation. Correcting mistakes Open a Python shell on your computer, or use the one at python.org/shell (https://openstax.org/r/ 100pythonshell). Run the following two statements in the shell: • x = 123 • y = 456 Making mistakes is common while typing in a shell. The following lines include typos and other errors. For each line: (1) run the line in a shell to see the result, (2) press the up arrow to repeat the line, and (3) edit the line to get the correct result. • print("Easy as", X) • print("y divided by 2 is", y / 0) • name = intput("What is your name? ") • print(name, "is", int(name), "letters long.") • print("That's all folks!) The expected output, after correcting typos, should look like: • Easy as 123 • y divided by 2 is 228.0 • (no error/output) • Stacie is 6 letters long. • That's all folks! 2.2 Type conversion Learning objectives By the end of this section you should be able to • Explain how the interpreter uses implicit type conversion. • Use explicit type conversion with int(), float(), and str(). Implicit type conversion Common operations update a variable such that the variable's data type needs to be changed. Ex: A GPS first assigns distance with 250, an integer. After a wrong turn, the GPS assigns distance with 252.5, a float. The Python interpreter uses implicit type conversion to automatically convert one data type to another. Once distance is assigned with 252.5, the interpreter will convert distance from an integer to a float without the TRY IT 40 2 • Expressions Access for free at openstax.org

---

## 10. Question `rq_b_27`
**Question**: What built-in function is used to convert an integer Unicode code point into a single character string?
**Target Document**: `chapter_03_objects.pdf`, Page 17 (Chunk ID: 8417)
**Gold Answer**: `chr(i)`

**Source Chunk Text**:
> Creating a tuple with user input Write a program that reads in two strings and two integers from input and creates a tuple, my_data, with the four values. Given input: x y 15 20 The output is: my_data: ('x', 'y', 15, 20) Access multimedia content (http://openstax.org/books/introduction-python-programming/pages/3-5-tuple- basics) 3.6 Chapter summary Highlights from this chapter include: • A string is a sequence of values that represents Unicode code points. • An index refers to the position of a value in a sequence (string, list, tuple). • Positive indexes range from 0 to length–1. Negative indexes range from –1 to –length. • F-strings are a convenient way to print multiple outputs and format integers and floats. • Variables refer to objects. Memory diagrams are useful for drawing variables and objects. • A list object can be used to refer to multiple objects, by index, using the same variable. • A tuple is similar to a list, but uses parentheses and cannot be changed once created. Code Description ord(c) Gets an integer representing the Unicode code point of a character. chr(i) Converts a Unicode code point (integer) into a One-character string. '\n' Escape sequence for the newline character. Table 3.5 Chapter 3 reference. TRY IT 3.6 • Chapter summary 83

---

## 11. Question `rq_b_20`
**Question**: Which musical group released the song mentioned in the Friday Boolean prompt?
**Target Document**: `chapter_04_decisions.pdf`, Page 6 (Chunk ID: 8424)
**Gold Answer**: `the Cure`

**Source Chunk Text**:
> Friday Boolean "It's Friday, I'm in love" —from "Friday I'm in Love," a song released by the Cure in 1992. Write a program that reads in the day of the week. Assign the Boolean variable, in_love, with the result of whether the day is Friday or not. Access multimedia content (http://openstax.org/books/introduction-python-programming/pages/ 4-1-boolean-values) Even numbers Write a program that reads in an integer and prints whether the integer is even or not. Remember, a number is even if the number is divisible by 2. To test this use number % 2 == 0. Ex: If the input is 6, the output is "6 is even: True". Access multimedia content (http://openstax.org/books/introduction-python-programming/pages/ 4-1-boolean-values) 4.2 If-else statements Learning objectives By the end of this section you should be able to • Identify which operations are performed when a program with if and if-else statements is run. • Identify the components of an if and if-else statement and the necessary formatting. • Create an if-else statement to perform an operation when a condition is true and another operation otherwise. if statement If the weather is rainy, grab an umbrella! People make decisions based on conditions like if the weather is rainy, and programs perform operations based on conditions like a variable's value. Ex: A program adds two numbers. If the result is negative, the program prints an error. A condition is an expression that evaluates to true or false. An if statement is a decision-making structure that contains a condition and a body of statements. If the condition is true, the body is executed. If the condition is false, the body is not executed. The if statement's body must be grouped together and have one level of indentation. The PEP 8 style guide recommends four spaces per indentation level. The Python interpreter will produce an error if the body is empty. TRY IT TRY IT 90 4 • Decisions Access for free at openstax.org

---

## 12. Question `rq_b_16`
**Question**: Which Python library specifically designed for data analysis is mentioned in the text?
**Target Document**: `chapter_01_statements.pdf`, Page 3 (Chunk ID: 8343)
**Gold Answer**: `Pandas`

**Source Chunk Text**:
> provide access to online streaming services include Spotipy (https://openstax.org/r/100spotipy), Pytube (https://openstax.org/r/100pytube), and Pydora (https://openstax.org/r/100pydora). Python-related tools often have the letters "py" in their name. The Python language This book introduces Python (https://openstax.org/r/100python), one of the top programming languages today. Leading tech giants like Google, Apple, NASA, Instagram, Pixar, and others use Python extensively. One reason why Python is popular is because many libraries exist for doing real work. A library is a collection of code that can be used in other programs. Python comes with an extensive Standard Library (https://openstax.org/r/100pythlibrary) for solving everyday computing problems like extracting data from files and creating summary reports. In addition, the community develops many other libraries for Python. Ex: Pandas (https://openstax.org/r/100pandas) is a widely used library for data analysis. Another reason why Python is popular is because the syntax is concise and straightforward. The syntax of a language defines how code must be structured. Syntax rules define the keywords, symbols, and formatting used in programs. Compared to other programming languages, Python is more concise and straightforward. EXAMPLE 1.1 Hello world in Python and Java By tradition, Hello World (https://openstax.org/r/100helloworld) is the first program to write when learning a new language. This program simply displays the message "Hello, World!" to the user. The hello world program is only one line in Python: print("Hello, World!") In contrast, the hello world program is five lines in Java (a different language). public class Hello { public static void main(String[] args) { System.out.println("Hello, World!"); } } However, conciseness is not the only consideration for which language is used. In different situations different languages may be more appropriate. Ex: Java is often used in Android development. CHECKPOINT Counting lines in a file Counting lines in a file; ch 1, video 2 (https://www.openstax.org/r/counting-lines) 1.1 • Background 9

---

## 13. Question `rq_b_01`
**Question**: What variable is computed to store the converted temperature value from one unit to another?
**Target Document**: `chapter_04_decisions.pdf`, Page 10 (Chunk ID: 8428)
**Gold Answer**: `new_temp`

**Source Chunk Text**:
> Calculate new_temp, the result of converting temp from Fahrenheit to Celsius or Celsius to Fahrenheit based on unit. Calculate new_unit: "c" if unit is "f" and "f" if unit is "c". Conversion formulas: • Degrees Celsius = (degrees Fahrenheit - 32) * 5/9 • Degrees Fahrenheit = (degrees Celsius * 5/9) + 32 Access multimedia content (http://openstax.org/books/introduction-python-programming/pages/4-2-if- else-statements) 4.3 Boolean operations Learning objectives By the end of this section you should be able to • Explain the purpose of logical operators. • Describe the truth tables for and, or, and not. • Create expressions with logical operators. • Interpret if-else statements with conditions using logical operators. Logical operator: and Decisions are often based on multiple conditions. Ex: A program printing if a business is open may check that hour >= 9 and hour < 17. A logical operator takes condition operand(s) and produces True or False. Python has three logical operators: and, or, and not. The and operator takes two condition operands and returns True if both conditions are true. p q p and q True True True True False False False True False False False False Table 4.1 Truth table: p and q. CHECKPOINT Example: Museum entry Example: Museum entry; ch 4, video 6 (https://www.openstax.org/r/museum-entry) 94 4 • Decisions Access for free at openstax.org

---

## 14. Question `rq_b_17`
**Question**: Which specific escape sequence is used to represent the tab character in a string?
**Target Document**: `chapter_03_objects.pdf`, Page 18 (Chunk ID: 8418)
**Gold Answer**: `'\t'`

**Source Chunk Text**:
> Code Description '\t' Escape sequence for the tab character. f"{number:.02d}" Creates a string by formatting an integer to be at least two digits. f"{number:.2f}" Creates a string by formatting a float to have two decimal places. id(object) Gets the identity (memory location) of an object. type(object) Gets the type (class name) of an object. my_list = ["a", "b", "c"] Creates a list of three strings. my_tuple = ("a", "b", "c") Creates a tuple of three strings. my_list[0] Gets the first element ("a") of my_tuple. my_tuple[-1] Gets the last element ("c") of my_tuple. Table 3.5 Chapter 3 reference. 84 3 • Objects Access for free at openstax.org

---

## 15. Question `rq_b_14`
**Question**: What is the specific arrival hour calculated for the 340-minute trip example starting at 13:25?
**Target Document**: `chapter_02_expressions.pdf`, Page 15 (Chunk ID: 8385)
**Gold Answer**: `Arrival hour is 19`

**Source Chunk Text**:
> Current minute (0-59)? 25 Trip time (in minutes)? 340 In this example, the current time is 13:25 (1:25pm). The trip time is 340 minutes (5 hours and 40 minutes). 340 minutes after 13:25 is 19:05 (7:05pm). Your program should output the result in this format: Arrival hour is 19 Arrival minute is 5 The arrival hour must be between 0 and 23. Ex: Adding 120 minutes to 23:00 should be 1:00, not 25:00. The arrival minute must be between 0 and 59. Ex: Adding 20 minutes to 8:55 should be 9:15, not 8:75. Hint: Multiply the current hour by 60 to convert hours to minutes. Then, calculate the arrival time, in total minutes, as an integer. Your code must not use Python keywords from later chapters, such as if or while. The solution requires only addition, multiplication, division, and modulo. Access multimedia content (http://openstax.org/books/introduction-python-programming/pages/ 2-5-dividing-integers) Change machine Self-checkout aisles are becoming increasingly popular at grocery stores. Customers scan their own items, and a computer determines the total purchase amount. Customers who pay in cash insert dollar bills, and a machine automatically dispenses change in coins. That's where this program comes into the story. Your task is to calculate how many of each coin to dispense. Your program should use the following prompts (user input in bold): Total amount? 18.76 Cash payment? 20 You may assume that the cash paid will always be a whole number (representing dollar bills) that is greater than or equal to the total amount. The program should calculate and output the amount of change due and how many dollars, quarters, dimes, nickels, and pennies should be dispensed: Change Due $1.24 Dollars: 1 Quarters: 0 Dimes: 2 Nickels: 0 Pennies: 4 Hint: Calculate the total change, in cents, as an integer. Use the round() function to avoid floating-point errors. TRY IT 2.5 • Dividing integers 51

---
