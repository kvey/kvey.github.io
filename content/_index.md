+++
title = "Hello! This is Colton."
date = 2019-11-13
+++

I can probably be reached:

[via email](mailto:colton@coltonpierson.com) | [kvey on GitHub](https://github.com/kvey) | [@kveykva on Twitter](https://twitter.com/Kveykva)

```bash
~ $ ls
colton_pierson
~ $ cat colton_pierson
```

Originally from Tucson, Arizona I currently live in San Francisco with my partner Gwen and our dog [Gilligan](https://www.instagram.com/gillytales/). Personally I'm mostly interested in ways to make software engineering better than how it currently feels, history, some woodworking and some cooking. Professionally I've worked as an engineer the past 10 years, at primarily early to mid-stage startups.

```bash
~ $ cowsay Like what
 ___________
< Like what >
 -----------
        \   ^__^
         \  (oo)\_______
            (__)\       )\/\
                ||----w |
                ||     ||
```

I'm currently at [Curative](https://curative.com/) scaling testing (> 18m tests) and vaccinations (>600k vaccinations) for COVID-19 and where I lead infrastructure engineering. Before that I was at [Figma](https://www.figma.com/) where I drastically improved loading performance of the viewer application and implemented a multiplayer-safe API for loading partial valid subsets of files. Then before _that_ I co-founded [Assembly](https://www.assembly.com/) in my early 20s and was accepted into [YC](https://www.ycombinator.com/) in their S15 batch, instrumenting manufacturing processes with cameras, sensors and integrations.

```bash
~ $ terraform plan
real_life.colton: Refreshing state... [id=production-colton]

------------------------------------------------------------------------

An execution plan has been generated and is shown below.
Resource actions are indicated with the following symbols:
  ~ update in-place

Terraform will perform the following actions:

  # real_life.colton will be updated in-place
  ~ resource "real_life" "colton" {
        id       = "production-colton"
        location = "us-west-1"
        name     = "colton-pierson"
      ~ tags     = {
          + "Environment" = "Production"
          + "Team"        = "Infrastructure"
        }
    }

Plan: 0 to add, 1 to change, 0 to destroy.

------------------------------------------------------------------------

This plan was saved to: plan.out

To perform exactly these actions, run the following command to apply:
    terraform apply "plan.out"
```

I enjoy working on complex systems and building things, even more than that I enjoy helping more people build even bigger things when its possible. Part of this leads to wanting to make better tools so its easier in general to do that building because I feel most of this is entirely overcomplicated. Another part of this leads to working on a lot of infrastructure.
