# Bible Markdown

Bible Markdown contains extended syntax elements for the Markdown specification.

Using Bible Markdown, you can simply use any plain text editor for Bible translating. You don't need to use formatting, but can use punctuation marks in a way that's readable and can easily be converted into formatting.

# What this is about

During the summer of 2025, I set myself to learning Koine Greek. I studied through a textbook, and to practice my Greek, I started to translate Romans into English. 

However, I became frustrated by the formatting challenges of doing this in word processing software. And I didn't need complex Bible editing software. So I thought, "What if there were some form of Markdown for writing the Bible?"

The great thing about Markdown is that the code itself looks very much like the final product, so you can just write in a text editor rather than in specialized software. But the code is formal enough that a computer can translate it to HTML, which browsers can read.

Well, there didn't seem to be such a thing for Bible text. So I decided to create it.

I created the aspects of Bible Markdown that I needed, and, with some AI help, developed a static webpage that I could use to edit and view it with. In the process, I created a specification which I call Bible HTML that Bible Markdown can render into, for viewing.

It worked great for me, and I thought, "I bet someone else could use this." However, I didn't have the time to develop it further, and eventually I stopped my practice translation project.

At this point, I don't know when I'll take up translating again, but I want to make this available in case someone could use it. So I worked with Claude AI to fill out the Bible Markdown specification a bit, and the Bible HTML specification until you could convert between it and USFM (one of the most common Bible formats). I had Claude create a simple web app and command-line utility to translate between Bible Markdown, Bible HTML, and USFM.

I've done little testing of the tooling, but I hope it is a little useful.

# Licensing

Everything I created is licensed with the MIT-0 license, so you are welcome to use it and develop it further as much as you like or need. There are some dependencies bundled along with it that have other licenses, so attribution info is included in the `biblemd` folder.

# How to use Bible Markdown

To see how to write in Bible Markdown, or how text in Bible Markdown should be formatted by an app, see the [Specification](Bible-Markdown-Specification.md). It's pretty straightforward, but the spec has a lot of AI-written descriptions, so I hope I can sometime make it more readable.

To use the conversion tool, see the [tooling readme](biblemd/TOOLING-README.md) to help you install and run it.